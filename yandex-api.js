// Общий код для страницы загрузчика: список файлов с Яндекс.Диска и запись в выбранную папку.
// Файлы пишутся через File System Access API, поэтому не зависят от настройки «спрашивать, куда сохранять».

const YD_API = 'https://cloud-api.yandex.net/v1/disk/public/resources';
const YD_PAGE_SIZE = 200;
const YD_WRITE_ATTEMPTS = 5;
// Сколько папок читать одновременно при сборе списка и сколько раз повторять запрос к API.
const YD_LIST_CONCURRENCY = 5;
const YD_API_ATTEMPTS = 4;
// Между попытками ждём всё дольше, чтобы не долбить сервер загрузок подряд.
const YD_RETRY_DELAY_MS = 2000;
// Если сервер не прислал ни байта за это время, попытка считается зависшей.
const YD_IDLE_TIMEOUT_MS = 30000;
// Ожидание заголовков ответа сервера загрузок.
const YD_HEADERS_TIMEOUT_MS = 40000;
// Хеш считаем целиком в памяти, поэтому для очень больших файлов полагаемся на размер.
const YD_HASH_MAX_BYTES = 300 * 1024 * 1024;

// Принимает ссылку вида https://disk.yandex.ru/d/КЛЮЧ или https://yadi.sk/d/КЛЮЧ.
function ydNormalizeLink(raw) {
  const value = raw.trim();
  if (!/^https?:\/\/(disk\.yandex\.[a-z.]+|yadi\.sk)\/d\//i.test(value)) {
    throw new Error('Вставьте публичную ссылку с Яндекс.Диска. Она начинается с https://disk.yandex.ru/d/');
  }
  return value.split('#')[0];
}

// Понятный текст ошибки ответа API Яндекс.Диска.
function ydApiErrorText(status) {
  if (status === 404) return 'Яндекс.Диск не нашёл файл или папку. Проверьте ссылку.';
  if (status === 429 || status === 503) return 'Яндекс.Диск сейчас занят. Подождите минуту и попробуйте снова.';
  if (status >= 500) return 'Яндекс.Диск временно не отвечает. Подождите минуту и попробуйте снова.';
  return `Яндекс.Диск ответил ошибкой ${status}. Проверьте ссылку.`;
}

// Запросы к API: при 429 и 503 (лимит или перегрузка) повторяем с паузой.
async function ydApiGet(endpoint, params) {
  const query = new URLSearchParams(params).toString();
  for (let attempt = 1; ; attempt += 1) {
    const response = await fetch(`${YD_API}${endpoint}?${query}`);
    if (response.ok) return response.json();
    const retryable = response.status === 429 || response.status === 503;
    if (!retryable || attempt >= YD_API_ATTEMPTS) {
      throw new Error(ydApiErrorText(response.status));
    }
    await new Promise((resolve) => setTimeout(resolve, YD_RETRY_DELAY_MS * attempt));
  }
}

// Читает одну папку: все страницы и вложенные папки кладёт в очередь, файлы — в список.
async function ydReadFolder(publicKey, path, files, queue) {
  let offset = 0;
  for (;;) {
    const data = await ydApiGet('', { public_key: publicKey, path, limit: YD_PAGE_SIZE, offset });
    const items = data._embedded?.items ?? [];
    for (const item of items) {
      if (item.type === 'dir') {
        queue.push(item.path.replace(/^disk:/, ''));
      } else {
        files.push({
          name: item.name,
          path: item.path.replace(/^disk:/, ''),
          size: item.size,
          sha256: item.sha256 ?? null,
          publicKey,
        });
      }
    }
    offset += items.length;
    if (!items.length || offset >= (data._embedded?.total ?? 0)) return;
  }
}

// Обходит всю папку: до YD_LIST_CONCURRENCY папок одновременно. onProgress({ folders, files, queued }).
async function ydListFolder(publicKey, rootPath, onProgress) {
  const files = [];
  const queue = [rootPath];
  let active = 0;
  let folders = 0;
  await new Promise((resolve, reject) => {
    const pump = () => {
      if (!queue.length && active === 0) {
        resolve();
        return;
      }
      while (active < YD_LIST_CONCURRENCY && queue.length) {
        const path = queue.shift();
        active += 1;
        ydReadFolder(publicKey, path, files, queue)
          .then(() => {
            folders += 1;
            if (onProgress) onProgress({ folders, files: files.length, queued: queue.length });
          })
          .catch(reject)
          .finally(() => {
            active -= 1;
            pump();
          });
      }
    };
    pump();
  });
  return files;
}

// Список файлов по ссылке и пути: одиночный файл или вся папка.
// rel — путь внутри выбранной папки, rootName — её имя (оно становится корнем в выбранной папке).
async function ydCollect(publicKey, path, onProgress) {
  const meta = await ydApiGet('', { public_key: publicKey, path, limit: 1 });
  if (meta.type === 'file') {
    return [{
      name: meta.name, path: meta.path.replace(/^disk:/, ''), rel: meta.name, rootName: '',
      size: meta.size, sha256: meta.sha256 ?? null, publicKey,
    }];
  }
  const base = path === '/' ? '' : path.replace(/\/+$/, '');
  const prefix = `${base}/`;
  const files = await ydListFolder(publicKey, path, onProgress);
  return files.map((entry) => ({
    ...entry,
    rel: entry.path.startsWith(prefix) ? entry.path.slice(prefix.length) : entry.path.replace(/^\/+/, ''),
    rootName: meta.name,
  }));
}

// Имя папки или файла для Windows: запрещённые символы заменяются, точки-только не допускаются.
function ydSafeSegment(part) {
  return part.replace(/[<>:"|?*\\/]/g, '_').replace(/^\.+$/, '_').trim() || '_';
}

// Части пути внутри выбранной папки: [имя корня, ...путь]. Пустые части отбрасываются.
function ydTargetParts(entry) {
  return [entry.rootName, ...entry.rel.replace(/^\/+/, '').split('/')].filter(Boolean).map(ydSafeSegment);
}

function ydAbortError() {
  const error = new Error('загрузка отменена');
  error.name = 'AbortError';
  return error;
}

async function ydSha256Hex(buffer) {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Существующий файл: возвращает его File или null, если файла нет.
async function ydExistingFile(dir, fileName) {
  try {
    const handle = await dir.getFileHandle(fileName);
    return await handle.getFile();
  } catch (error) {
    if (error.name === 'NotFoundError') return null;
    throw error;
  }
}

// Файл уже есть и совпадает с Яндексом? Сравниваем хеш, если он известен, иначе размер.
async function ydAlreadyHave(file, entry) {
  if (!file) return false;
  if (entry.sha256 && file.size <= YD_HASH_MAX_BYTES) {
    return (await ydSha256Hex(await file.arrayBuffer())) === entry.sha256;
  }
  return entry.size ? file.size === entry.size : false;
}

// Чтение следующего куска с таймаутом простоя.
function ydReadWithIdle(reader) {
  let timer;
  const idle = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('сервер перестал присылать файл')), YD_IDLE_TIMEOUT_MS);
  });
  return Promise.race([reader.read(), idle]).finally(() => clearTimeout(timer));
}

// Один заход: скачивание и запись одного файла. Бросает ошибку при любом несовпадении.
async function ydWriteAttempt(rootDir, entry, options) {
  const parts = ydTargetParts(entry);
  const fileName = parts.pop();
  let dir = rootDir;
  for (const part of parts) {
    dir = await dir.getDirectoryHandle(part, { create: true });
  }

  const { href } = await ydApiGet('/download', { public_key: entry.publicKey, path: entry.path });

  // Запрос с таймаутом на заголовки. Таймаут и отмена пользователя — разные вещи:
  // таймаут даёт обычную ошибку, чтобы файл попробовали скачать ещё раз.
  const controller = new AbortController();
  let headersTimedOut = false;
  const headersTimer = setTimeout(() => {
    headersTimedOut = true;
    controller.abort();
  }, YD_HEADERS_TIMEOUT_MS);
  const onUserAbort = () => controller.abort();
  options.signal?.addEventListener('abort', onUserAbort);
  let response;
  try {
    response = await fetch(href, { signal: controller.signal });
  } catch (error) {
    options.signal?.removeEventListener('abort', onUserAbort);
    if (headersTimedOut) throw new Error('сервер не ответил вовремя');
    throw error;
  } finally {
    clearTimeout(headersTimer);
  }
  if (!response.ok || !response.body) {
    options.signal?.removeEventListener('abort', onUserAbort);
    throw new Error(`сервер загрузок не отдал файл (ошибка ${response.status})`);
  }
  const declared = Number(response.headers.get('content-length'));
  if (entry.size && declared && declared !== entry.size) {
    options.signal?.removeEventListener('abort', onUserAbort);
    throw new Error('размер файла на сервере не совпадает с Яндекс.Диском');
  }

  const handle = await dir.getFileHandle(fileName, { create: true });
  const writable = await handle.createWritable();
  const keepChunks = Boolean(entry.sha256) && (entry.size ?? 0) <= YD_HASH_MAX_BYTES;
  const chunks = [];
  let written = 0;
  const reader = response.body.getReader();
  try {
    for (;;) {
      if (options.signal?.aborted) throw ydAbortError();
      const { done, value } = await ydReadWithIdle(reader);
      if (done) break;
      await writable.write(value);
      if (keepChunks) chunks.push(value);
      written += value.byteLength;
      if (options.onProgress) options.onProgress(written);
    }
    await writable.close();
  } catch (error) {
    reader.cancel().catch(() => {});
    await writable.abort().catch(() => {});
    throw error;
  } finally {
    options.signal?.removeEventListener('abort', onUserAbort);
  }

  if (entry.size && written !== entry.size) {
    throw new Error('файл скачался не весь');
  }
  if (entry.sha256 && keepChunks) {
    const hash = await ydSha256Hex(await new Blob(chunks).arrayBuffer());
    if (hash !== entry.sha256) {
      throw new Error('содержимое файла не совпало с Яндекс.Диском');
    }
  }
  return written;
}

// Пишет один файл в выбранную папку. Если такой файл уже есть и совпадает, пропускает его.
// options: { onProgress(bytes), signal, onRetry(attempt) } — прогресс по байтам, отмена и сообщение о повторе.
// Возвращает { status: 'written' | 'skipped', bytes }.
async function ydWriteEntry(rootDir, entry, options = {}) {
  const parts = ydTargetParts(entry);
  const fileName = parts[parts.length - 1];
  let dir = rootDir;
  for (const part of parts.slice(0, -1)) {
    dir = await dir.getDirectoryHandle(part, { create: true });
  }
  const existing = await ydExistingFile(dir, fileName);
  if (await ydAlreadyHave(existing, entry)) {
    return { status: 'skipped', bytes: existing.size };
  }

  let lastError = null;
  for (let attempt = 1; attempt <= YD_WRITE_ATTEMPTS; attempt += 1) {
    if (options.signal?.aborted) throw ydAbortError();
    try {
      const bytes = await ydWriteAttempt(rootDir, entry, options);
      return { status: 'written', bytes };
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      lastError = error;
      if (attempt < YD_WRITE_ATTEMPTS) {
        if (options.onRetry) options.onRetry(attempt + 1);
        await new Promise((resolve) => setTimeout(resolve, YD_RETRY_DELAY_MS * attempt));
      }
    }
  }
  throw new Error(`не скачался после ${YD_WRITE_ATTEMPTS} попыток. Причина: ${lastError.message}`);
}
