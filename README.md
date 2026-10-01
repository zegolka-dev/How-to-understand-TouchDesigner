# TD Explainer

[Русский](#русский) · [English](#english)

---

## Русский

**TD Explainer** — веб-приложение, которое разбирает видео, сделанное в TouchDesigner, и объясняет, как повторить такой визуал своими руками: какие ноды взять, как их соединить и какие значения параметров поставить. Результат включает пошаговую инструкцию с отметками выполнения, интерактивную схему нод, советы по анимации и постобработке.

- Работает целиком в браузере, без своего сервера.
- **Видео никуда не загружается**: браузер сам берёт из него 6–24 кадра (JPEG до 768 px) и отправляет только их и несколько чисел (движение, зацикленность, яркость, палитра) напрямую в выбранную нейросеть.
- Использует **ваш собственный бесплатный ключ** Google Gemini (основной) или OpenRouter (запасной, бесплатные модели `:free`).
- Ключ хранится только в `localStorage` этого браузера, его можно удалить кнопкой «Забыть ключ».
- История разборов хранится локально (IndexedDB), её можно экспортировать и импортировать файлом.
- Экспорт в Markdown, PDF (печать), SVG/PNG схемы, копирование в буфер обмена.
- Русский и английский, светлая и тёмная тема, интерфейс в стиле Liquid Glass.

### Как бесплатно получить ключ Google Gemini

1. Откройте [aistudio.google.com/apikey](https://aistudio.google.com/apikey).
2. Войдите через Google-аккаунт и примите условия, если попросят.
3. Нажмите **Create API key** (если попросят выбрать проект — подойдёт любой или новый).
4. Скопируйте ключ (начинается с `AIza`) и вставьте его в мастер настройки приложения.
5. Нажмите «Проверить подключение».

Запасной вариант — OpenRouter: [openrouter.ai/settings/keys](https://openrouter.ai/settings/keys) → **Create API Key** → скопировать ключ `sk-or-…`. Используются только бесплатные модели с поддержкой изображений.

### Лимиты

У бесплатных тарифов есть ограничения на число запросов в минуту и в день. Конкретные цифры зависят от модели и тарифа и меняются, смотрите актуальные условия: [Gemini rate limits](https://ai.google.dev/gemini-api/docs/rate-limits), [OpenRouter limits](https://openrouter.ai/docs/api-reference/limits). Один разбор — один запрос; каждый уточняющий вопрос — ещё один (кадры повторно не отправляются). При исчерпании лимита приложение предложит переключиться на запасного провайдера одним кликом.

### Деплой на GitHub Pages

1. Создайте репозиторий на GitHub и запушьте ветку `main`.
2. В репозитории: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Workflow `.github/workflows/deploy.yml` сам опубликует сайт при каждом пуше в `main` (публикуются только `index.html`, `css/`, `js/`, `assets/`).

Сборка не нужна: это статические файлы. Локально: `python -m http.server 8765` и откройте `http://localhost:8765`.

### Разработка и тесты

```bash
npm install
npx playwright install chromium
npm run fixtures   # тестовое видео через ffmpeg (если ffmpeg есть в PATH)
npm test           # проверка CSP-хэша, парсера и e2e-тесты Playwright
```

Без ffmpeg тесты сами создают webm-видео в браузере. После правки инлайн-скрипта темы в `index.html` выполните `npm run csp`. Скриншоты обеих тем (1280 и 390 px) сохраняются в `tests/screenshots/`.

### Известные ограничения

- Параметры по видео определяются **приблизительно**: нейросеть видит только несколько кадров, поэтому значения — стартовые, их нужно подстраивать на глаз (такие помечены значком ≈). Быстрые детали между кадрами не видны.
- Качество разбора зависит от модели; если приём нельзя определить, это будет указано в разделе «Что не удалось определить».
- Некоторые форматы (например HEVC `.mov`) браузер может не открыть — перекодируйте в mp4 (H.264) или webm.
- Ограничения на видео: до 10 минут и 500 МБ.
- Лимиты бесплатных тарифов Google и OpenRouter могут меняться; в некоторых регионах Gemini API недоступен.
- `frame-ancestors` нельзя задать через `<meta>` CSP, а GitHub Pages не позволяет задавать заголовки.

Иконки нарисованы в стиле Lucide (ISC), встроены как inline SVG. Внешних библиотек, аналитики и трекеров нет.

---

## English

**TD Explainer** is a web app that analyses a video made in TouchDesigner and explains how to rebuild the look by hand: which nodes to use, how to wire them and what parameter values to set. You get a step-by-step guide with checkboxes, an interactive node diagram, and notes on animation and post-processing.

- Runs entirely in the browser, no backend.
- **Your video is never uploaded**: the browser grabs 6–24 frames (JPEG up to 768 px) and sends only those plus a few numbers (motion, looping, brightness, palette) directly to the AI you choose.
- Uses **your own free key** for Google Gemini (main) or OpenRouter (backup, free `:free` models).
- The key is kept only in this browser's `localStorage`; remove it any time with “Forget key”.
- Breakdown history is stored locally (IndexedDB) and can be exported/imported as a file.
- Export to Markdown, PDF (print), SVG/PNG diagram, or copy to the clipboard.
- Russian and English, light and dark themes, Liquid Glass UI.

### Getting a free Google Gemini key

1. Open [aistudio.google.com/apikey](https://aistudio.google.com/apikey).
2. Sign in with your Google account and accept the terms if asked.
3. Click **Create API key** (any project or a new one is fine).
4. Copy the key (starts with `AIza`) and paste it into the app's setup wizard.
5. Click “Test connection”.

Backup: OpenRouter — [openrouter.ai/settings/keys](https://openrouter.ai/settings/keys) → **Create API Key** → copy the `sk-or-…` key. Only free models with image input are used.

### Limits

Free tiers limit requests per minute and per day. Exact numbers depend on the model and plan and change over time — see [Gemini rate limits](https://ai.google.dev/gemini-api/docs/rate-limits) and [OpenRouter limits](https://openrouter.ai/docs/api-reference/limits). One breakdown is one request; each follow-up question is one more (frames are not re-sent). When you hit a limit, the app offers a one-click switch to the backup provider.

### Deploying to GitHub Pages

1. Create a GitHub repository and push the `main` branch.
2. In the repository: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. `.github/workflows/deploy.yml` publishes the site on every push to `main` (only `index.html`, `css/`, `js/`, `assets/`).

No build step: these are static files. Locally: `python -m http.server 8765`, then open `http://localhost:8765`.

### Development and tests

```bash
npm install
npx playwright install chromium
npm run fixtures   # test video via ffmpeg (if ffmpeg is on PATH)
npm test           # CSP hash check, parser check and Playwright e2e tests
```

Without ffmpeg, tests generate a webm video in the browser. After editing the inline theme script in `index.html`, run `npm run csp`. Screenshots of both themes (1280 and 390 px) go to `tests/screenshots/`.

### Known limitations

- Parameters are estimated **approximately**: the AI sees only a few frames, so values are starting points to tune by eye (marked with ≈). Fast details between frames are invisible.
- Quality depends on the model; anything that could not be identified is listed under “What could not be determined”.
- Some formats (e.g. HEVC `.mov`) may not open in the browser — re-encode to mp4 (H.264) or webm.
- Video limits: up to 10 minutes and 500 MB.
- Free-tier limits of Google and OpenRouter may change; the Gemini API is not available in some regions.
- `frame-ancestors` cannot be set via a `<meta>` CSP, and GitHub Pages does not allow custom headers.

Icons are drawn in the Lucide style (ISC) as inline SVG. No external libraries, analytics or trackers.
