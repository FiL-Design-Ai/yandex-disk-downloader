// Страница загрузки: список файлов по ссылке и запись выбранных файлов в папку на компьютере.

// Два потока: на замерах третий поток сервер не ускорял, а подвисания становились дольше.
const YD_CONCURRENCY = 2;
const YD_SECOND_PASS_DELAY_MS = 20000;
const PROGRESS_INTERVAL_MS = 500;

const linkInput = document.getElementById('link');
const openButton = document.getElementById('open');
const listBox = document.getElementById('list');
const downloadButton = document.getElementById('downloadSelected');
const cancelButton = document.getElementById('cancel');
const selectAllButton = document.getElementById('selectAll');
const statusBox = document.getElementById('status');
const progressBox = document.getElementById('progress');
const summaryBox = document.getElementById('summary');
const recentBox = document.getElementById('recent');
const barBox = document.getElementById('bar');
const barFill = document.getElementById('fill');
const openTabButton = document.getElementById('openTab');

let entries = [];
let controller = null;

function setStatus(text, cls = '') {
  statusBox.className = cls;
  statusBox.textContent = text;
}

function formatSize(bytes) {
  if (!bytes) return '';
  const units = ['Б', 'КБ', 'МБ', 'ГБ'];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(i ? 1 : 0)} ${units[i]}`;
}

function renderList() {
  listBox.innerHTML = '';
  entries.forEach((entry, index) => {
    const row = document.createElement('label');
    row.className = 'row';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = false;
    box.dataset.index = String(index);
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = entry.rel;
    const size = document.createElement('span');
    size.className = 'size';
    size.textContent = formatSize(entry.size);
    row.append(box, name, size);
    listBox.append(row);
  });
  const hasItems = entries.length > 0;
  downloadButton.disabled = !hasItems;
  selectAllButton.disabled = !hasItems;
  updateSummary();
}

// Строка над списком: сколько выбрано и примерный объём. Подпись «Выбрать все» меняется вместе с выбором.
function updateSummary() {
  const boxes = [...listBox.querySelectorAll('input[type=checkbox]')];
  const chosen = boxes.filter((box) => box.checked).map((box) => entries[Number(box.dataset.index)]);
  const bytes = chosen.reduce((sum, entry) => sum + (entry.size || 0), 0);
  summaryBox.textContent = entries.length
    ? `Выбрано ${chosen.length} из ${entries.length}${chosen.length ? `, около ${formatSize(bytes)}` : ''}`
    : '';
  selectAllButton.textContent = entries.length && chosen.length === entries.length ? 'Снять все' : 'Выбрать все';
  downloadButton.disabled = !entries.length || Boolean(controller);
}

// Сообщаем странице Яндекс.Диска (через фоновый скрипт), как идёт загрузка: процент виден на кнопке даже при закрытом окне.
function notifyParent(state) {
  if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
    chrome.runtime.sendMessage({ type: 'yd-state', ...state }).catch(() => {});
  }
}

// ---- недавние ссылки: хранятся в браузере, до 5 штук ----

function loadRecent() {
  try {
    return JSON.parse(localStorage.getItem('yd-recent') || '[]');
  } catch (error) {
    return [];
  }
}

function saveRecent(link, name) {
  const items = [{ link, name }, ...loadRecent().filter((item) => item.link !== link)].slice(0, 5);
  try {
    localStorage.setItem('yd-recent', JSON.stringify(items));
  } catch (error) {
    // Без сохранения список недавних просто не запомнится.
  }
  renderRecent();
}

function renderRecent() {
  recentBox.innerHTML = '';
  for (const item of loadRecent()) {
    const chip = document.createElement('button');
    chip.className = 'chip';
    chip.type = 'button';
    chip.textContent = item.name;
    chip.title = item.link;
    chip.addEventListener('click', () => {
      linkInput.value = item.link;
      openButton.click();
    });
    recentBox.append(chip);
  }
}

// Отчёт о загрузке: что записано, что уже было, что не скачалось. Лежит в папке с названием ссылки.
async function writeReport(rootDir, chosen, results, errors) {
  try {
    const rootName = chosen[0].rootName;
    const folder = rootName ? await rootDir.getDirectoryHandle(ydSafeSegment(rootName), { create: true }) : rootDir;
    const lines = [`Отчёт о загрузке, ${new Date().toLocaleString('ru-RU')}`, ''];
    for (const entry of chosen) {
      const status = results.get(entry) || 'не скачан';
      const extra = status === 'не скачан' ? (errors.get(entry) || '') : (entry.sha256 ? `SHA-256 ${entry.sha256}` : '');
      lines.push(`${status}\t${entry.rel}\t${formatSize(entry.size)}\t${extra}`.trimEnd());
    }
    const handle = await folder.getFileHandle('download-report.txt', { create: true });
    const writable = await handle.createWritable();
    await writable.write(lines.join('\n'));
    await writable.close();
    return true;
  } catch (error) {
    return false;
  }
}

// ---- запоминание папки: хранится в IndexedDB, доступ переспрашивается при нажатии ----

function openSavedDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('yd-helper', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('dirs');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveDirHandle(handle) {
  const db = await openSavedDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction('dirs', 'readwrite');
    tx.objectStore('dirs').put(handle, 'root');
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function loadDirHandle() {
  try {
    const db = await openSavedDb();
    const handle = await new Promise((resolve, reject) => {
      const request = db.transaction('dirs').objectStore('dirs').get('root');
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return handle;
  } catch (error) {
    return null;
  }
}

// ---- список ----

async function loadList() {
  const publicKey = ydNormalizeLink(linkInput.value);
  const params = new URLSearchParams(location.search);
  const path = params.get('path') && publicKey === params.get('link') ? params.get('path') : '/';
  return ydCollect(publicKey, path);
}

openButton.addEventListener('click', async () => {
  openButton.disabled = true;
  setStatus('Загружаю список файлов...');
  try {
    entries = await loadList();
    renderList();
    saveRecent(ydNormalizeLink(linkInput.value), entries[0]?.rootName || entries[0]?.name || linkInput.value);
    setStatus(`Нашёл файлов: ${entries.length}. Отметьте нужные и нажмите «Выбрать папку и скачать».`, 'ok');
  } catch (error) {
    entries = [];
    renderList();
    setStatus(error.message, 'err');
  } finally {
    openButton.disabled = false;
  }
});

linkInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') openButton.click();
});

// Вставили ссылку — список открывается сам, кнопка «Показать файлы» нужна только при ручном вводе.
linkInput.addEventListener('paste', () => {
  setTimeout(() => {
    if (/^https?:\/\/(disk\.yandex\.[a-z.]+|yadi\.sk)\/d\//i.test(linkInput.value.trim())) openButton.click();
  }, 0);
});

selectAllButton.addEventListener('click', () => {
  const boxes = listBox.querySelectorAll('input[type=checkbox]');
  const allChecked = [...boxes].every((box) => box.checked);
  boxes.forEach((box) => { box.checked = !allChecked; });
  updateSummary();
});

listBox.addEventListener('change', updateSummary);

// ---- загрузка ----

// Выполняет задачи в несколько потоков. Порядок сохраняется примерно, результаты собираются отдельно.
async function runPool(items, limit, worker) {
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length && !controller.signal.aborted) {
      const item = items[next];
      next += 1;
      await worker(item);
    }
  });
  await Promise.all(runners);
}

async function downloadEntries(rootDir, chosen) {
  const started = Date.now();
  const bytesByEntry = new Map();
  const stats = { written: 0, skipped: 0 };
  const errors = new Map();
  const results = new Map();
  const totalBytes = chosen.reduce((sum, entry) => sum + (entry.size || 0), 0);

  const tick = setInterval(() => {
    const total = [...bytesByEntry.values()].reduce((sum, b) => sum + b, 0);
    const seconds = Math.max((Date.now() - started) / 1000, 0.1);
    const speed = total / seconds / (1024 * 1024);
    progressBox.textContent = `Скачано ${stats.written + stats.skipped} из ${chosen.length} · `
      + `${formatSize(total)} · ${speed.toFixed(1)} МБ/с`;
    const percent = totalBytes ? Math.min(100, Math.round((total / totalBytes) * 100)) : 0;
    barBox.hidden = false;
    barFill.style.width = `${percent}%`;
    barBox.setAttribute('aria-valuenow', String(percent));
    notifyParent({ busy: true, percent });
  }, PROGRESS_INTERVAL_MS);

  const tryAll = async (items) => {
    const failed = [];
    await runPool(items, YD_CONCURRENCY, async (entry) => {
      setStatus(`Скачиваю: ${entry.rel}`);
      try {
        const result = await ydWriteEntry(rootDir, entry, {
          signal: controller.signal,
          onProgress: (bytes) => bytesByEntry.set(entry, bytes),
          onRetry: (attempt) => setStatus(`Сервер медлит с файлом «${entry.rel}». Пробую ещё раз: попытка ${attempt} из ${YD_WRITE_ATTEMPTS}.`),
        });
        bytesByEntry.set(entry, result.bytes);
        if (result.status === 'skipped') stats.skipped += 1; else stats.written += 1;
        results.set(entry, result.status === 'skipped' ? 'уже был' : 'записан');
        errors.delete(entry);
      } catch (error) {
        // Отмену пользователя не считаем ошибкой. Любой другой сбой запоминаем и покажем в итоге.
        if (controller.signal.aborted) return;
        errors.set(entry, error.message);
        results.set(entry, 'не скачан');
        failed.push(entry);
      }
    });
    return failed;
  };

  try {
    let pending = await tryAll(chosen);
    if (pending.length && !controller.signal.aborted) {
      setStatus(`Не скачалось файлов: ${pending.length}. Пробую ещё раз через 20 секунд...`, 'err');
      await new Promise((resolve) => setTimeout(resolve, YD_SECOND_PASS_DELAY_MS));
      pending = controller.signal.aborted ? pending : await tryAll(pending);
    }
    return { pending, stats, errors, results, cancelled: controller.signal.aborted };
  } finally {
    clearInterval(tick);
  }
}

async function startDownload(rootDir) {
  const chosen = [...listBox.querySelectorAll('input[type=checkbox]:checked')]
    .map((box) => entries[Number(box.dataset.index)]);
  if (!chosen.length) {
    setStatus('Не отмечено ни одного файла. Отметьте галочками, что нужно скачать.', 'err');
    return;
  }
  controller = new AbortController();
  downloadButton.disabled = true;
  cancelButton.disabled = false;
  progressBox.textContent = '';
  barBox.hidden = true;
  let ok = false;
  try {
    const { pending, stats, errors, results, cancelled } = await downloadEntries(rootDir, chosen);
    const reportSaved = await writeReport(rootDir, chosen, results, errors);
    // «Готово» только когда каждый выбранный файл записан или уже был на компьютере.
    const done = stats.written + stats.skipped;
    if (cancelled) {
      setStatus(`Загрузка остановлена. Скачано: ${stats.written}, уже были: ${stats.skipped}. Когда запустите снова, готовые файлы не будут скачиваться заново.`, 'err');
    } else if (pending.length || done < chosen.length) {
      const lines = pending.map((entry) => `${entry.rel}: ${errors.get(entry)}`);
      const problem = lines.length ? `Не получилось скачать:\n${lines.join('\n')}` : 'Часть файлов не дошла до записи.';
      setStatus(`Скачано не всё. Готово: ${stats.written}, уже были: ${stats.skipped}.\n${problem}\nНажмите «Выбрать папку и скачать» ещё раз: скачаются только недостающие.`, 'err');
    } else {
      ok = true;
      setStatus(`Готово! Скачано файлов: ${stats.written}. Уже были на компьютере: ${stats.skipped}. Все файлы на месте и совпадают с Яндекс.Диском.${reportSaved ? '\nОтчёт сохранён в файл download-report.txt.' : ''}`, 'ok');
    }
  } finally {
    progressBox.textContent = '';
    barBox.hidden = true;
    barFill.style.width = '0%';
    notifyParent({ busy: false, done: ok });
    controller = null;
    updateSummary();
    cancelButton.disabled = true;
  }
}

// Новая папка: выбираем через окно и сохраняем для следующего раза.
// Есть ли отмеченные файлы. Проверяем до выбора папки, чтобы не спрашивать папку зря.
function hasSelection() {
  if (listBox.querySelector('input[type=checkbox]:checked')) return true;
  setStatus('Не отмечено ни одного файла. Отметьте галочками, что нужно скачать.', 'err');
  return false;
}

downloadButton.addEventListener('click', async () => {
  if (!hasSelection()) return;
  // showDirectoryPicker нужно вызвать сразу по клику, пока действует нажатие пользователя.
  // Окно выбора открывается в последней папке, которую выбирали раньше.
  const lastDir = await loadDirHandle();
  let rootDir;
  try {
    rootDir = await window.showDirectoryPicker({ mode: 'readwrite', ...(lastDir ? { startIn: lastDir } : {}) });
  } catch (error) {
    if (error.name === 'AbortError') {
      setStatus('Папка не выбрана. Ничего не скачано.', 'err');
    } else {
      // В окне поверх страницы Chrome может не дать выбрать папку. Тогда помогает обычная вкладка.
      setStatus('Chrome не дал выбрать папку в этом окне. Откройте загрузку в новой вкладке: там выбор папки работает.', 'err');
      openTabButton.hidden = false;
    }
    return;
  }
  try {
    await saveDirHandle(rootDir);
  } catch (error) {
    // Без сохранения загрузка всё равно пройдёт, просто в следующий раз снова спросим папку.
  }
  await startDownload(rootDir);
});

cancelButton.addEventListener('click', () => {
  controller?.abort();
  cancelButton.disabled = true;
  setStatus('Останавливаю загрузку, подождите немного...', 'err');
});

// Ссылка и путь могут прийти из кнопки на странице Яндекс.Диска или из окна плагина.
(function prefillFromUrl() {
  const params = new URLSearchParams(location.search);
  const link = params.get('link');
  if (link) {
    linkInput.value = link;
    openButton.click();
  }
})();

openTabButton.addEventListener('click', () => {
  window.open(location.href, '_blank');
});

// Во время загрузки закрытие окна её остановит, поэтому Chrome спрашивает подтверждение.
window.addEventListener('beforeunload', (event) => {
  if (controller) event.preventDefault();
});

renderRecent();
