// Окно плагина: вставить ссылку и открыть страницу загрузки. Вся работа с файлами — на download.html.

const linkInput = document.getElementById('link');
const openButton = document.getElementById('open');
const statusBox = document.getElementById('status');

function setStatus(text, cls = '') {
  statusBox.className = cls;
  statusBox.textContent = text;
}

openButton.addEventListener('click', () => {
  try {
    const link = ydNormalizeLink(linkInput.value);
    const params = new URLSearchParams({ link, path: '/' });
    chrome.tabs.create({ url: chrome.runtime.getURL(`download.html?${params}`) });
    setStatus('Страница загрузки открыта в новой вкладке.', 'ok');
  } catch (error) {
    setStatus(error.message, 'err');
  }
});

linkInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') openButton.click();
});
