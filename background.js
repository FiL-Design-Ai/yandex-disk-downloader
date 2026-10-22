// Фоновый скрипт: открывает окно загрузки по кнопке на странице Яндекс.Диска и из меню по правой кнопке,
// а также передаёт на страницу Яндекса, как идёт загрузка.
// Сама загрузка идёт в окне download.html, потому что запись в папку требует действия пользователя.

const MENU_ID = 'yd-download-link';
const WINDOW_SIZE = { width: 840, height: 700 };

// Окно загрузки → вкладка Яндекс.Диска, которой отправляем статус. Окно знает, кто его открыл.
const openerByWindow = new Map();

function openDownloadWindow(link, path, openerTabId) {
  const params = new URLSearchParams({ link, path: path || '/' });
  return chrome.windows.create({
    url: chrome.runtime.getURL(`download.html?${params}`),
    type: 'popup',
    focused: true,
    ...WINDOW_SIZE,
  }).then((win) => {
    if (openerTabId != null) openerByWindow.set(win.id, openerTabId);
    return win;
  });
}

// Пункт меню по правой кнопке на ссылке Яндекс.Диска. Меню пересоздаём, чтобы после обновления не было дублей.
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: 'Скачать с Яндекс.Диска',
      contexts: ['link'],
      targetUrlPatterns: ['https://disk.yandex.ru/d/*', 'https://yadi.sk/d/*'],
    });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID || !info.linkUrl) return;
  openDownloadWindow(info.linkUrl.split(/[?#]/)[0], '/', tab?.id);
});

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === 'open-download-window') {
    openDownloadWindow(message.link, message.path, sender.tab?.id).catch(() => {});
    return false;
  }
  if (message?.type === 'yd-state' && sender.tab) {
    const tabId = openerByWindow.get(sender.tab.windowId);
    if (tabId != null) chrome.tabs.sendMessage(tabId, message).catch(() => {});
    return false;
  }
  return false;
});

chrome.windows.onRemoved.addListener((windowId) => {
  openerByWindow.delete(windowId);
});
