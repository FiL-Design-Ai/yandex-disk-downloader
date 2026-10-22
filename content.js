// Кнопка «Скачать» на странице публичной ссылки Яндекс.Диска. Всегда видна в углу экрана.
// По нажатию (или Alt+Shift+D) открывает небольшое окно загрузки. Яндекс не разрешает встраивать
// чужие страницы внутрь себя, поэтому окно отдельное. Кнопка живёт в «теневом» блоке, стили Яндекса на неё не действуют.
(() => {
  const HOST_ID = 'monjaro-yd-host';
  const LABEL = 'Скачать';
  const DONE_LABEL_MS = 4000;

  let host = null;
  let pill = null;
  let busy = false;
  let doneTimer = null;

  // Ключ публичной ссылки и текущий путь внутри неё, например /2-Ассистент Дуся.
  function readLocation() {
    const match = location.pathname.match(/^\/d\/([^/]+)(\/.*)?$/);
    if (!match) return null;
    return {
      publicKey: `https://disk.yandex.ru/d/${match[1]}`,
      path: match[2] ? decodeURIComponent(match[2]) : '/',
    };
  }

  function ensureHost() {
    if (host) return;
    host = document.createElement('div');
    host.id = HOST_ID;
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `
      <style>
        .pill { position: fixed; right: 16px; bottom: 16px; z-index: 2147483000; padding: 11px 20px; border: 1px solid rgba(255, 255, 255, .12); border-radius: 999px;
          background: rgba(20, 21, 24, .88); color: #f4f4f5; font: 600 14px/1 system-ui, sans-serif; box-shadow: 0 8px 24px rgba(0, 0, 0, .35); cursor: pointer; backdrop-filter: blur(10px); }
        .pill:hover { background: rgba(38, 40, 45, .95); }
        .pill.busy, .pill.done { background: #f4a08a; color: #1a120f; border-color: transparent; }
      </style>
      <button class="pill" type="button">${LABEL}</button>`;
    pill = root.querySelector('.pill');
    pill.addEventListener('click', openWindow);
    document.body.appendChild(host);
  }

  function openWindow() {
    const where = readLocation();
    if (!where) return;
    chrome.runtime.sendMessage({ type: 'open-download-window', link: where.publicKey, path: where.path });
  }

  // Состояние от страницы загрузки: идёт ли скачивание и сколько процентов. Видно даже при закрытом окне.
  function showState(state) {
    if (!pill) return;
    busy = Boolean(state.busy);
    clearTimeout(doneTimer);
    if (busy) {
      pill.className = 'pill busy';
      pill.textContent = `Скачиваю ${state.percent ?? 0}%`;
    } else if (state.done) {
      pill.className = 'pill done';
      pill.textContent = 'Готово ✓';
      doneTimer = setTimeout(() => showState({}), DONE_LABEL_MS);
    } else {
      pill.className = 'pill';
      pill.textContent = LABEL;
    }
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === 'yd-state') showState(message);
  });

  // Alt+Shift+D открывает окно загрузки для текущей папки.
  window.addEventListener('keydown', (event) => {
    if (event.altKey && event.shiftKey && event.code === 'KeyD') {
      event.preventDefault();
      openWindow();
    }
  });

  // Яндекс.Диск — одностраничное приложение: адрес меняется без перезагрузки, поэтому проверяем его регулярно.
  function refresh() {
    if (!readLocation()) {
      if (host) host.style.display = 'none';
      return;
    }
    ensureHost();
    host.style.display = '';
  }

  refresh();
  setInterval(refresh, 1000);
})();
