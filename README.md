# Yandex Disk Downloader

![Version](https://img.shields.io/badge/version-1.0.0-2bebc8)
![License](https://img.shields.io/badge/license-MIT-blue)
![Chrome](https://img.shields.io/badge/Chrome-Manifest%20V3-4285f4?logo=googlechrome&logoColor=white)

**Language / Язык:** [Русский](#русский) · [English](#english)

---

## Русский

Расширение Chrome для скачивания файлов и папок по **публичной** ссылке Яндекс.Диска с сохранением структуры папок.

### Возможности

| Функция | Описание |
|---|---|
| Кнопка на странице | «Скачать» в правом нижнем углу публичной папки или файла, показывает процент загрузки |
| Окно загрузки | Отдельное небольшое окно: список файлов, выбор папки, запуск |
| Быстрый вызов | `Alt+Shift+D` или пункт «Скачать с Яндекс.Диска» в меню правой кнопки на ссылке |
| Структура папок | Подпапки и файлы сохраняются так же, как на Яндекс.Диске |
| Без повторной загрузки | Файлы, которые уже есть и совпадают (SHA-256 или размер), пропускаются |
| Докачка | После обрыва или остановки следующий запуск качает только остаток |
| Проверка целостности | Каждый файл проверяется по SHA-256, рядом появляется `download-report.txt` |
| Повторы | До 5 попыток на файл при сбоях сервера |
| Запоминание папки | Окно выбора открывается в последней выбранной папке |

### Установка

**Вариант 1. Готовый архив.** Скачайте `yandex-disk-downloader-1.0.0.zip` на странице [Releases](https://github.com/FiL-Design-Ai/yandex-disk-downloader/releases/latest) и распакуйте.

**Вариант 2. Из исходников.**

```bash
git clone https://github.com/FiL-Design-Ai/yandex-disk-downloader.git
```

Затем:

1. Откройте `chrome://extensions`.
2. Включите «Режим разработчика» (переключатель справа вверху).
3. Нажмите «Загрузить распакованное» и выберите папку, в которой лежит `manifest.json`.

### Использование

1. Откройте публичную ссылку на папку или файл Яндекс.Диска.
2. Нажмите «Скачать» в правом нижнем углу или `Alt+Shift+D`.
3. Отметьте нужные файлы. По умолчанию ничего не выбрано.
4. Нажмите «Выбрать папку и скачать» и выберите папку на компьютере.

Внутри выбранной папки появится папка с названием из Яндекс.Диска, например `C:\Users\<имя>\Downloads\<название папки>\`.

Альтернативный вход: иконка расширения в панели Chrome. Вставьте ссылку и нажмите «Показать файлы».

### Ограничения

- Работает только с публичными ссылками. Приватные файлы без ссылки не поддерживаются.
- Окно загрузки отдельное: Яндекс не разрешает встраивать чужие страницы внутрь себя.
- Нужна современная версия Chrome с поддержкой выбора папки.
- Закрытие окна во время загрузки её останавливает. Chrome попросит подтверждение.
- Если Яндекс.Диск показывает баннер «Восстанавливаем работу сервиса», часть файлов может не скачаться. Плагин покажет их в списке ошибок.

### Проверка

1. Откройте публичную ссылку на папку или файл Яндекс.Диска. В правом нижнем углу появится кнопка «Скачать».
2. Нажмите «Скачать». Откроется окно со списком файлов, все галочки сняты.
3. Отметьте нужные файлы и нажмите «Выбрать папку и скачать».
4. Во время загрузки кнопка на странице показывает проценты. По окончании появится «Готово ✓».
5. В выбранной папке появится папка с названием из Яндекс.Диска и файл `download-report.txt`. Пример пути: `C:\Users\<имя>\Downloads\<название папки>\`.
6. Нажмите правой кнопкой мыши на ссылку Яндекс.Диска: в меню должен быть пункт «Скачать с Яндекс.Диска».

### Структура проекта

| Файл | Назначение |
|---|---|
| `manifest.json` | Настройки расширения |
| `background.js` | Открывает окно загрузки, пункт меню, передаёт статус на страницу Яндекса |
| `content.js` | Кнопка «Скачать» на странице Яндекс.Диска |
| `popup.html`, `popup.js` | Окно из иконки расширения |
| `download.html`, `download.js` | Окно загрузки: список, выбор папки, запись, отчёт |
| `yandex-api.js` | Работа с API Яндекс.Диска и запись файлов |
| `icons/` | Иконки |

### Лицензия

MIT. См. [LICENSE](LICENSE).

---

## English

A Chrome extension that downloads files and folders from a **public** Yandex Disk link and keeps the folder structure.

### Features

| Feature | Description |
|---|---|
| On-page button | "Скачать" (Download) in the bottom-right corner of a public folder or file, shows download progress |
| Download window | A separate small window: file list, folder choice, start |
| Quick access | `Alt+Shift+D`, or "Скачать с Яндекс.Диска" in the right-click menu on a link |
| Folder structure | Subfolders and files are saved the same way as on Yandex Disk |
| No re-downloads | Files that already exist and match (SHA-256 or size) are skipped |
| Resume | After an interruption or stop, the next run downloads only the rest |
| Integrity check | Every file is verified by SHA-256; `download-report.txt` is written next to the files |
| Retries | Up to 5 attempts per file when the server fails |
| Remembered folder | The folder picker opens in the last folder you chose |

### Installation

**Option 1. Ready-made archive.** Download `yandex-disk-downloader-1.0.0.zip` from the [Releases](https://github.com/FiL-Design-Ai/yandex-disk-downloader/releases/latest) page and unzip it.

**Option 2. From source.**

```bash
git clone https://github.com/FiL-Design-Ai/yandex-disk-downloader.git
```

Then:

1. Open `chrome://extensions`.
2. Turn on "Developer mode" (top-right toggle).
3. Click "Load unpacked" and select the folder that contains `manifest.json`.

### Usage

1. Open a public link to a Yandex Disk folder or file.
2. Click "Скачать" in the bottom-right corner, or press `Alt+Shift+D`.
3. Check the files you need. Nothing is selected by default.
4. Click "Выбрать папку и скачать" and choose a folder on your computer.

A folder with the name from Yandex Disk is created inside the chosen folder, for example `C:\Users\<name>\Downloads\<folder name>\`.

Alternative entry point: the extension icon in the Chrome toolbar. Paste a link and click "Показать файлы".

### Limitations

- Public links only. Private files without a link are not supported.
- The download window is separate: Yandex does not allow embedding third-party pages.
- A recent Chrome version with folder-picker support is required.
- Closing the window during a download stops it. Chrome will ask for confirmation.
- If Yandex Disk shows the banner "Восстанавливаем работу сервиса", some files may fail. The extension lists them in the error report.

### Verification

1. Open a public link to a Yandex Disk folder or file. A "Скачать" button appears in the bottom-right corner.
2. Click "Скачать". A window with the file list opens, all checkboxes are empty.
3. Check the files you need and click "Выбрать папку и скачать".
4. During the download the button on the page shows the percentage. When it finishes, it shows "Готово ✓".
5. A folder with the name from Yandex Disk and a `download-report.txt` file appear in the chosen folder. Example path: `C:\Users\<name>\Downloads\<folder name>\`.
6. Right-click the Yandex Disk link: the menu should contain "Скачать с Яндекс.Диска".

### Project structure

| File | Purpose |
|---|---|
| `manifest.json` | Extension settings |
| `background.js` | Opens the download window, context menu item, sends status to the Yandex page |
| `content.js` | "Скачать" button on the Yandex Disk page |
| `popup.html`, `popup.js` | Window opened from the extension icon |
| `download.html`, `download.js` | Download window: list, folder choice, writing, report |
| `yandex-api.js` | Yandex Disk API and file writing |
| `icons/` | Icons |

### License

MIT. See [LICENSE](LICENSE).
