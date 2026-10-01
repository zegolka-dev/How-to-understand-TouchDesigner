# TD Explainer — план

Статус этапов (отмечать [x] + заметки «на чём остановились»):

- [x] **Этап 0.** План, CLAUDE.md, docs/DECISIONS.md
- [x] **Этап 1 (а).** Каркас, i18n, темы, дизайн-система, настройки
- [x] **Этап 2 (б).** Онбординг и провайдеры
- [x] **Этап 3 (в).** Анализ видео и вызов модели со структурированным JSON
- [ ] **Этап 4 (г).** Результат, SVG-схема, экспорт
- [ ] **Этап 5 (д).** История и уточняющие вопросы
- [ ] **Этап 6 (е).** Тесты, README, деплой

Источник требований: `docs/TZ.md/TZ.md.txt`. Эталон: `prototype/td-explainer.html` (не менять).

---

## 1. Структура файлов

```
/                         корень репо = корень сайта (деплой через Actions, см. DECISIONS)
├─ index.html             единственная страница, CSP meta, инлайн-скрипт темы до отрисовки
├─ css/
│  ├─ tokens.css          дизайн-токены: цвета, стекло, радиусы, тени, отступы, типографика, motion (обе темы)
│  ├─ base.css            reset, типографика, фокус, layout, фон (mesh-blobs)
│  ├─ glass.css           материал стекла: .glass, .glass--dense, .glass--tint, specular, fallbacks
│  ├─ components.css      nav-пилюля, segmented, кнопки, поля, слайдер, drop-зона, sheet, toast, switch, chip
│  ├─ result.css          карточки результата, шаги, граф, чат
│  └─ print.css           @media print: белая простая вёрстка без стекла
├─ js/
│  ├─ main.js             точка входа: init store/i18n/theme, роутер вкладок, связывание view
│  ├─ core/
│  │  ├─ store.js         safe localStorage (try/catch) + простое состояние с подписками
│  │  ├─ dom.js           $/h() (createElement, только textContent), escapeHtml, announce (aria-live)
│  │  ├─ i18n.js          t(key, vars), setLang, data-i18n обход DOM, детект языка браузера
│  │  ├─ theme.js         auto/light/dark, data-theme, matchMedia, View Transitions (если есть)
│  │  └─ errors.js        AppError {code, status, provider, hintKey, retryable, quota}
│  ├─ i18n/
│  │  ├─ ru.js            словарь RU (все строки UI, подсказки ошибок, тексты онбординга)
│  │  └─ en.js            словарь EN
│  ├─ video/
│  │  ├─ extract.js       loadVideo, seek с таймаутом, извлечение N кадров (≤768px, JPEG 0.72), миниатюры
│  │  ├─ metrics.js       motion, loopDiff, brightness, palette (логика прототипа), motionWord-коды
│  │  └─ limits.js        ограничения длины/размера, оценка размера запроса
│  ├─ providers/
│  │  ├─ base.js          контракт Provider, общий fetchJson с таймаутом/AbortController, маппинг HTTP-ошибок
│  │  ├─ gemini.js        GeminiProvider (ListModels, generateContent, responseSchema)
│  │  ├─ openrouter.js    OpenRouterProvider (/models, chat/completions, json mode)
│  │  └─ registry.js      выбор активного/запасного провайдера, фабрика, fallback-повтор
│  ├─ ai/
│  │  ├─ prompt.js        системный промт (RU/EN, уровни), справочник рецептов, сборка первого хода
│  │  ├─ schema.js        JSON Schema ответа (для Gemini responseSchema) + описание для OpenRouter
│  │  └─ parse.js         извлечение JSON, мягкое восстановление, валидация/нормализация
│  ├─ render/
│  │  ├─ markdown.js      мини-рендер Markdown с экранированием (из прототипа; для сырого текста и чата)
│  │  ├─ result.js        рендер разделов результата из JSON, чекбоксы шагов, значок «≈»
│  │  ├─ graph.js         раскладка + SVG-граф, связь нода↔шаг
│  │  └─ export.js        Markdown-файл, копирование, print, SVG/PNG схемы
│  ├─ history/
│  │  └─ db.js            IndexedDB: CRUD, clear, export/import JSON
│  └─ views/
│     ├─ analyze.js       вкладка «Разбор»: drop-зона, кадры, метрики, опции, запуск, результат, чат
│     ├─ history.js       вкладка «История»
│     ├─ settings.js      вкладка «Настройки»: ключи, провайдеры, модели, язык, тема, «Забыть ключ», онбординг
│     ├─ onboarding.js    мастер-лист (5 шагов)
│     └─ ui.js            sheet/модалки (focus trap, Esc), toast, segmented control, nav-пилюля
├─ assets/
│  ├─ icons.svg           SVG-спрайт линейных иконок (<symbol>), stroke=currentColor
│  └─ favicon.svg
├─ tests/
│  ├─ fixtures/           make-video.(sh|mjs): ffmpeg testsrc2 → test.mp4; mock-ответы (ok, broken JSON, ошибки)
│  ├─ e2e/*.spec.mjs      Playwright
│  └─ screenshots/        (gitignore) артефакты
├─ package.json           только devDependencies для тестов (@playwright/test); приложение без сборки
├─ playwright.config.mjs  webServer: npx http-server / python -m http.server
├─ .github/workflows/
│  ├─ deploy.yml          Pages: upload-pages-artifact (только файлы сайта) → deploy-pages
│  └─ test.yml            (опц.) прогон Playwright на PR
├─ .nojekyll
├─ README.md              RU + EN
├─ CLAUDE.md, PLAN.md, docs/DECISIONS.md
└─ prototype/td-explainer.html
```

Внешних библиотек нет (vendor/ не нужен). Всё рисуется вручную: SVG-граф, Markdown, иконки.

## 2. Модули (контракты)

**core/store.js** — `ls.get/set/remove(key)` в try/catch; ключи с префиксом `tdx.`: `lang`, `theme`, `onboarded`, `provider.active`, `provider.fallback`, `gemini.key`, `gemini.model`, `openrouter.key`, `openrouter.model`, `level`, `frames`. Ключи API читаются только провайдером в момент запроса; нигде не логируются.

**core/i18n.js** — словари как ES-объекты (ключи `section.item`). `t()` с подстановкой `{n}`; плюрализация через `Intl.PluralRules`. Язык: сохранённый → `navigator.languages` (ru*/uk*/be*/kk* → ru, иначе en). Смена языка перерисовывает `[data-i18n]`, `[data-i18n-attr]` и активную вкладку, `<html lang>`. Тест-проверка: ключи RU и EN совпадают.

**core/theme.js** — режим `auto|light|dark`; применённая тема в `html[data-theme]`; в `auto` слушает `prefers-color-scheme`. Смена через `document.startViewTransition` если есть. Инлайн-скрипт в `<head>` (≤10 строк) повторяет логику чтения до первого кадра — чтобы не было мигания. Т.к. CSP запрещает inline-скрипты, используем хэш `'sha256-…'` этого скрипта в CSP (пересчитывать при изменении; тест сверяет).

**video/extract.js** — из прототипа: `objectURL`, `loadedmetadata`, `seek(t)` с ожиданием `seeked` и таймаутом 8 с, кадры в точках `(i+0.5)/n*dur`, canvas ≤768px, `toDataURL('image/jpeg', .72)`, параллельно 64×36 сэмплы для метрик. Прогресс-колбэк, отмена (AbortSignal). Миниатюры для истории: 4 кадра по 160px, JPEG 0.6.

**video/metrics.js** — без изменений по сути: `motion` (средняя попиксельная разница соседних), `loopDiff` (первый vs последний; <0.04 → «вероятно зациклено»), `brightness`, `palette` (топ-5 квантованных цветов). Возвращает числа + коды (`motionLevel: 0..3`), а слова берёт i18n.

**video/limits.js** — `MAX_DURATION = 10 мин`, `MAX_SIZE = 500 МБ` (видео не грузится в сеть, лимит — ради памяти и времени seek), понятные сообщения. `estimateRequestBytes(frames, promptLen)` = сумма base64 + текст → показ «≈ 1,4 МБ» рядом с ползунком.

**providers/base.js** — интерфейс:
```
analyze({frames, times, metrics, lang, level, note, fileName}) → {data|null, raw, model, usage?}
followUp({history, question, lang, level})                      → {text}
listModels()                                                    → [{id, label, vision:true}]
testConnection()                                                → {ok, models?:n} | throws AppError
defaultModel(models)                                            → id
```
`fetchJson(url, opts)` с таймаутом (90 с для анализа, 15 с для теста), маппинг статусов → `AppError` с `hintKey`: 400 (ключ/формат; `API key` в тексте → `err.badKey`), 401/403 (ключ/регион), 404 (модель → «обновить список»), 413 (слишком большой запрос → «меньше кадров»), 429 / `RESOURCE_EXHAUSTED` → `quota:true`, 5xx/сеть → retryable. Сообщение ошибки от API экранируется при выводе и обрезается.

**providers/gemini.js** — база `https://generativelanguage.googleapis.com/v1beta`, ключ только в заголовке `x-goog-api-key` (не в URL). `listModels`: `GET /models?pageSize=200`, фильтр `supportedGenerationMethods ∋ generateContent`, имя `^gemini`, исключить `tts|image|embedding|live|audio|robotics|computer` (все Gemini-модели такого класса принимают изображения); сортировка: flash (не lite) → flash-lite → pro, затем по версии убыв. Дефолт = первый. `analyze`: `system_instruction`, `contents` (текст + `inline_data` кадры), `generationConfig: {temperature:.4, maxOutputTokens:8192, responseMimeType:'application/json', responseSchema}`. Если модель вернёт 400 на responseSchema — повтор без схемы (только mime), промт всё равно описывает JSON. `followUp`: история `contents`, где первый user-ход содержит кадры (один раз, как в прототипе), ответы — обычный текст (Markdown). `testConnection`: listModels + проверка, что есть хотя бы одна подходящая (без траты квоты генерации).

**providers/openrouter.js** — база `https://openrouter.ai/api/v1`, `Authorization: Bearer`, заголовки `HTTP-Referer`/`X-Title` (опционально). `listModels`: `GET /models`, фильтр `id` оканчивается на `:free` и `architecture.input_modalities ∋ image` (fallback: `architecture.modality` содержит `image`). `analyze`: `chat/completions`, `messages` с `image_url` (data URL), `response_format:{type:'json_object'}` (если модель не поддерживает → повтор без него). `testConnection`: `GET /key` (проверка ключа) + listModels. Ошибки 402/429 → `quota:true`.

**providers/registry.js** — `getActive()`, `getFallback()` (настроенный второй провайдер с ключом). `runWithFallback(op)` не переключает сам: при `quota` UI показывает кнопку «Переключиться на OpenRouter и повторить» → один клик повторяет ту же операцию с запасным.

**ai/prompt.js** — `buildSystem(lang, level)` и `buildFirstTurn(metrics, frames, note, lang)`. См. §5.

**ai/schema.js** — схема ответа (§3.1) в формате OpenAPI-подмножества для Gemini (`type: OBJECT`, `enum` для family, `required`), + текстовое описание формы для промта.

**ai/parse.js** — `parseAnalysis(raw) → {data, repaired:boolean} | {data:null, raw}`:
1. снять ```json-ограждения; 2. `JSON.parse`; 3. при неудаче — вырезать от первой `{` до последней `}`, удалить хвостовые запятые, заменить «умные» кавычки, закрыть незакрытые скобки/строки по стеку (для обрезанного по maxTokens ответа); 4. `normalize()`: приведение типов, дефолты для пустых массивов, `family` → верхний регистр/из суффикса `type` (`Noise TOP` → TOP), уникальные `id` (slug), отбросить connections на несуществующие ноды, `confidence` clamp 0..1, `steps.n` по порядку, обрезка длинных строк. Валидным считается объект с `summary` или `nodes`/`steps`. Иначе — сырой текст через markdown.js.

**render/markdown.js** — функция `md()` из прототипа (экранирование до разметки), + ссылки не рендерятся (безопасность).

**render/result.js** — строит DOM только через `textContent`/`h()`; никакого `innerHTML` для данных модели. Разделы: Что на видео (summary + chip confidence + предупреждение если не TD), Приёмы, Схема нод (graph), Пошаговая инструкция (iOS-переключатели; состояние чекбоксов сохраняется в записи истории), Анимация и управление, Постобработка, Что подстроить на глаз (+ uncertainties). Параметр с `approximate:true` получает значок `≈` с `title`/aria-label «приблизительно». Stagger-появление карточек.

**render/graph.js** — §4. `renderGraph(data, {onSelect}) → svg`; `highlight(nodeIds)`.

**render/export.js** — `toMarkdown(data, meta, lang)` (заголовки из i18n, схема как список «a → b»), `download(blob, name)`, `copy(text)` (clipboard API + fallback из прототипа), `printPdf()` = `window.print()`, `svgToFile(svg)` (инлайн вычисленных цветов, т.к. CSS-переменные вне документа не работают), `svgToPng(svg, scale 2)` через `Image` + canvas (data URL, без внешних запросов).

**history/db.js** — БД `tdx`, v1, store `analyses` (keyPath `id`, index `createdAt`). `add/get/list/remove/clear/exportAll/importAll(file)` (импорт: валидация формы, новые id при конфликте, ограничение размера файла 50 МБ).

**views/*** — тонкие: читают состояние, вызывают сервисы, рисуют. `ui.js`: `openSheet(el)` (focus trap, Esc, возврат фокуса, `inert` фону), `toast(msg, {action})`, `segmented(el, onChange)` (стрелки ←/→, role=radiogroup), nav-пилюля (role=tablist, хэш-роутинг `#analyze|#history|#settings`).

## 3. Схема данных

### 3.1 Ответ модели
```json
{
  "summary": "string",
  "isLikelyTouchDesigner": true,
  "techniques": [{"name": "Feedback trails", "why": "string"}],
  "nodes": [{
    "id": "feedback1", "type": "Feedback TOP", "family": "TOP",
    "params": [{"name": "Target TOP", "value": "comp1", "approximate": false}],
    "purpose": "string"
  }],
  "connections": [{"from": "noise1", "to": "comp1", "inputIndex": 0, "uncertain": false}],
  "steps": [{"n": 1, "title": "string", "nodeIds": ["noise1"], "details": "string"}],
  "animation": ["string (выражения в `код`)"],
  "postfx": ["string"],
  "tweakNotes": ["string"],
  "uncertainties": ["string"],
  "confidence": 0.6
}
```
Отклонение от ТЗ (минимальное, в DECISIONS): `techniques` — объекты `{name, why}` (в ТЗ просто массив; строки тоже принимаются normalize), добавлены `connections[].uncertain` (нужно для пунктира) и `isLikelyTouchDesigner`. `family` enum: TOP|CHOP|SOP|DAT|COMP|MAT.

### 3.2 Запись истории (IndexedDB `analyses`)
```json
{
  "id": "uuid", "v": 1, "createdAt": 1727800000000,
  "fileName": "clip.mp4", "provider": "gemini", "model": "gemini-…-flash",
  "lang": "ru", "level": "mid", "note": "string",
  "metrics": {"duration":0,"w":0,"h":0,"motion":0,"loopDiff":0,"brightness":0,"palette":["#…"]},
  "thumbs": ["data:image/jpeg;base64,…"],
  "result": { /* 3.1 */ } , "raw": "string|null",
  "chat": [{"role":"user|model","text":"string"}],
  "doneSteps": [1,3]
}
```
Кадры для API в историю не пишутся (только 4 миниатюры). Уточняющие вопросы из открытой истории: кадров нет → первый ход содержит JSON результата и метрики текстом (без изображений), это записано в UI-подсказке. Экспорт: `{app:"td-explainer", v:1, exportedAt, items:[…]}`.

## 4. Алгоритм раскладки SVG-графа

1. Ноды по `id`; рёбра только между существующими; дубли убрать.
2. Циклы (feedback!): DFS, рёбра в серую вершину помечаются обратными, исключаются из сортировки и рисуются отдельно дугой снизу (пунктир-петля с подписью). Feedback TOP в TD и так берёт вход по ссылке параметром — это честно.
3. Слой = длина самого длинного пути от источника (Kahn по DAG). Изолированные ноды — слой 0 (CHOP-драйверы обычно источники).
4. Порядок внутри слоя: 2–3 прохода барицентрического упорядочивания (медиана позиций родителей вниз, детей вверх) для уменьшения пересечений.
5. Координаты: x = слой × (W+gapX), y = индекс × (H+gapY), центрирование слоёв по высоте. Нода 168×56, gapX 64, gapY 20. Текст: имя (`id`) жирно + `type` мелко; обрезка с `…` и `<title>` с полным.
6. Рёбра: кубическая Безье от правого края источника к левому порту приёмника; порт по `inputIndex` (порты распределяются по высоте ноды). `uncertain` → `stroke-dasharray`. Маркер-стрелка.
7. Цвета семейств (как в TD): TOP фиолетовый, CHOP зелёный, SOP синий, DAT пурпурный/розовый, COMP серо-голубой, MAT жёлто-оранжевый — токены `--fam-top` и т.д. для обеих тем. Нода: полупрозрачная заливка + полоса-акцент семейства слева + тонкая светлая обводка (стекло без backdrop-filter, чтобы не плодить blur).
8. viewBox по габаритам; контейнер с горизонтальной прокруткой на мобильных; ноды фокусируемые (`tabindex=0`, `role=button`, aria-label «Noise TOP noise1, шаг 2»), Enter/Space = выбор.
9. Связь: клик по ноде → подсветка шагов, где `nodeIds ∋ id` (+ scrollIntoView); клик/фокус по шагу → подсветка его нод и рёбер между ними.
10. Ноды > 40 → предупреждение, граф всё равно строится.

## 5. Системный промт (ai/prompt.js)

Блоки (RU и EN версии с одинаковой структурой; язык ответа = язык UI, явное правило «все строки JSON на {lang}, названия операторов и параметров — на английском, как в интерфейсе TD»):
1. **Роль:** опытный TD-разработчик и преподаватель; разбирает визуал по кадрам и метрикам.
2. **Правила именования:** точные названия операторов с типом (Noise TOP, Feedback TOP, Composite TOP, Displace TOP, Level TOP, Transform TOP, Blur TOP, Edge TOP, Ramp TOP, Mirror TOP, Tile TOP, GLSL TOP, Render TOP, Bloom TOP, Geometry COMP, Camera COMP, Light COMP, Lfo CHOP, Noise CHOP, Math CHOP, Audio Spectrum CHOP, Audio Device In CHOP, Particle SOP / Particles GPU, Null …); параметры как в интерфейсе (Period, Amplitude, Harmonics, Opacity, Blend Mode/Operation, Displace Weight, Target TOP, Translate…), стартовые значения, порядок соединений и номер входа.
3. **Справочник рецептов с признаками на кадрах:** feedback-шлейфы (размытые хвосты, «эхо», нарастание); displace (волнистые искажения следуют шуму); instancing (много одинаковых объектов, сетка/облако); калейдоскоп/Mirror/Tile (симметрия, повторы); audio-reactive (рывки масштаба/яркости в такт, Audio Spectrum CHOP → Math → параметр); шум/зерно (Noise TOP Monochrome/Add); bloom/glow/chromatic aberration (ореолы, цветные края); GLSL TOP (математические паттерны, raymarching, SDF-формы); particles (точки с инерцией и затуханием). Для каждого — минимальная цепочка нод.
4. **Использование метрик:** motion → скорость анимации; loopDiff → зацикленность, объяснить `absTime.seconds`/`me.time.seconds`, `sin(absTime.seconds*2*pi/T)` для бесшовного цикла с периодом T, Lfo CHOP Period = длительность; brightness/palette → Level, Ramp, Lookup TOP.
5. **Анти-выдумывание:** «вероятно» + 1–2 варианта, всё сомнительное в `uncertainties`, `approximate:true` для подобранных на глаз значений, `uncertain:true` для догадочных соединений, `isLikelyTouchDesigner:false` и пояснение, если похоже на After Effects/Blender/съёмку; `confidence` честно.
6. **Уровень:** новичок (Tab-меню, где искать параметр, что такое TOP/CHOP) / средний / продвинутый (GLSL, Python, оптимизация).
7. **Формат:** только JSON по схеме, без Markdown вокруг; 4–12 нод, ≤10 шагов, без воды; id нод в стиле TD (`noise1`, `feedback1`).
8. Для `followUp` отдельная короткая системная инструкция: отвечать Markdown, кратко, в контексте разобранной сети.

Первый ход (как в прототипе): вводная с метриками + пожелание + пары «Кадр i, t=…» + изображение.

## 6. Дизайн-токены Liquid Glass

Шрифт: `-apple-system, "SF Pro Display", "SF Pro Text", "Segoe UI Variable", system-ui, sans-serif`; моно `ui-monospace, "SF Mono", Consolas`. Шкала: 12/14/16(база)/18/22/28/34; веса 400/500/600; line-height 1.5 текст, 1.2 заголовки. Отступы 4/8/12/16/24/32/48. Радиусы: `--r-card 26px`, `--r-sheet 32px`, `--r-field 14px`, `--r-pill 999px`. Тач-цели ≥44px.

| Токен | Light | Dark |
|---|---|---|
| `--bg` | #EEF1F8 | #07080D |
| `--blob-1..4` | #8EC5FF, #C7A6FF, #FFB8D9, #9BF0E1 | #3A2BFF, #9B2CFF, #0094FF, #00C2A8 (opacity .55) |
| `--glass-fill` | rgba(255,255,255,.45) | rgba(255,255,255,.08) |
| `--glass-fill-dense` (длинный текст) | rgba(255,255,255,.78) | rgba(22,24,32,.78) |
| `--glass-blur` | blur(24px) saturate(170%) | blur(28px) saturate(160%) |
| `--glass-stroke` (градиент кромки) | rgba(255,255,255,.9)→.25 | rgba(255,255,255,.28)→.04 |
| `--glass-shadow` | 0 8px 32px rgba(31,38,80,.12), inset 0 1px 0 rgba(255,255,255,.7) | 0 10px 40px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.12) |
| `--text` / `--text-2` | #0B0D14 / #3C4254 | #F4F6FB / #B7BDCC |
| `--accent` (кнопка, фокус) | #3B5BFF (on: #fff) | #7C8CFF (on: #0B0D14) |
| `--ok` / `--warn` / `--err` | #0F7B4E / #8A5A00 / #C62828 | #46D693 / #FFC56B / #FF7A7A |
| `--focus-ring` | 0 0 0 3px var(--accent) + 0 0 0 5px rgba(255,255,255,.8) | то же с тёмной подложкой |
| `--fam-top/chop/sop/dat/comp/mat` | #7B4FD6/#2E9E4F/#2F6FD8/#C04CA8/#5B6B80/#C98A12 | светлее на 20% |

Контраст проверяем на «худшем» фоне (blob под стеклом): текст на `--glass-fill-dense` ≥4.5:1, второстепенный ≥4.5:1; для обычного стекла — только короткие подписи крупнее 16px/600 или с `text-shadow`-подложкой. Проверка — тест (axe-подобный расчёт по вычисленным цветам на скриншоте не нужен; сверяем пары токенов функцией контраста + ручной просмотр скриншотов).

Материал `.glass`: `background: var(--glass-fill)`, `backdrop-filter` + `-webkit-`, `border:1px solid transparent` с `background-clip` двойным градиентом для кромки (ярче сверху-слева), `::before` specular (radial-gradient в верхнем левом углу, opacity .6), `::after` тонкий нижний отблеск. Hover: fill +6%, `scale(1.015)`; active: `scale(.97)`; пружина `--spring: cubic-bezier(.34,1.56,.64,1)` 380 мс, выход быстрее (200 мс). Варианты: `--dense`, `--tint` (accent 70% для основной кнопки), `--clear`.

Преломление (только Chromium, крупные элементы — nav и sheet): SVG `<filter id="lg-refract">` feTurbulence(baseFrequency .008, 1 octave) + feDisplacementMap(scale 18) применяется через `backdrop-filter: url(#lg-refract) blur(...)` под `@supports` + проверкой JS (`CSS.supports('backdrop-filter','url(#x)')` даёт ложноположительные → включаем только для Chromium по feature-флагу `html.refract`). Fallback — обычное стекло.

Фон: 4 размытых пятна (`filter: blur(80px)`, `position:fixed`, `will-change: transform`), дрейф 40–60 с `alternate`; на мобильных 3 пятна и blur меньше.

Fallbacks:
- `@supports not (backdrop-filter: blur(1px))` → `--glass-fill: var(--glass-fill-solid)` (≈.92 непрозрачности).
- `@media (prefers-reduced-transparency: reduce)` и `(prefers-contrast: more)` → плотная заливка, обводка 1.5px `--text-2`, без specular.
- `@media (prefers-reduced-motion: reduce)` → без дрейфа, пружин, stagger; переходы ≤ 1 мс (кроме opacity 150 мс).
- `forced-colors: active` → системные цвета, без фона.
- Не больше 2 уровней вложенного `backdrop-filter`: внутри стеклянных карточек элементы (поля, chips, ноды) — без blur, только полупрозрачная заливка.

Компоненты: nav-пилюля (снизу на мобильных, сверху-по центру на ≥768px, ползунок = абсолютный `.glass--clear` с `transform: translateX` по активной вкладке); segmented (тема, язык, уровень) с той же механикой; кнопки primary/secondary/icon (круг 44px, aria-label); drop-зона (стекло, при dragover — обводка-градиент + scale 1.01 + пульс иконки); sheet (появление `scale(.96)+blur(8px)+opacity` → норма; на мобильных — снизу); iOS-switch для шагов (role=switch нет — используем нативный `input type=checkbox` с кастомным видом, label кликабелен); toast (стекло, aria-live=polite).

Иконки (inline SVG `<symbol>`, 24px, stroke 1.75, round caps): upload, film, sparkles, history, settings, sun, moon, auto, globe, key, check, x, copy, download, print, trash, import, export, chevron-left/right, external-link, refresh, info, alert, send, graph.

Печать: `print.css` скрывает nav/фон/чат/кнопки, белый фон, чёрный текст, граф с белой заливкой нод, page-break перед «Пошаговой инструкцией» не ставим (avoid внутри шага).

## 7. CSP и безопасность

```
default-src 'none'; script-src 'self' 'sha256-<theme-inline>'; style-src 'self';
img-src 'self' data: blob:; media-src blob:; font-src 'self';
connect-src https://generativelanguage.googleapis.com https://openrouter.ai;
manifest-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none'
```
(`frame-ancestors` в meta не работает — отмечено в README). Инлайн-стилей нет: динамические цвета (палитра, семейства) через `el.style.setProperty` — это CSSOM, CSP `style-src` его не блокирует. Ссылки наружу (`aistudio`, `openrouter.ai/keys`, условия) — `rel="noopener noreferrer"`. Ключ: `type=password` + кнопка «показать», `autocomplete=off`, `spellcheck=false`; ошибки API не содержат ключ, но на всякий случай `redact()` вырезает `AIza…`/`sk-or-…` из любых текстов ошибок перед выводом.

## 8. Риски и меры

| Риск | Мера |
|---|---|
| Модели/квоты меняются | Не хардкодим модели и цифры лимитов; ListModels, ссылки на официальные страницы условий |
| Модель не поддерживает responseSchema / json_object | Автоповтор без схемы; промт описывает JSON; parse.js восстанавливает |
| Обрезанный JSON (maxTokens) | Закрытие скобок по стеку; ограничение размеров в промте; иначе сырой текст |
| CORS у API | Gemini и OpenRouter поддерживают браузерные запросы — проверим в этапе 2 реальным ключом пользователя (у меня ключа нет → проверяем моками, пользователь — вручную) |
| Кодеки (HEVC .mov, mkv) не открываются | Понятное сообщение «перекодируйте в mp4 H.264/webm»; seek-таймаут |
| Неточный seek у некоторых браузеров | Ожидание `seeked` + `requestVideoFrameCallback` если доступен; таймаут |
| Большой запрос (24 кадра) | Оценка размера, предупреждение > 15 МБ, совет уменьшить кадры; 413 обработан |
| Производительность blur на слабых устройствах | ≤2 уровня blur, пятна фона с `transform` только, меньше пятен на мобильных, reduced-transparency |
| Мигание темы | Инлайн-скрипт с CSP-хэшем; тест Playwright на первый кадр |
| XSS через ответ модели | Только textContent; markdown.js экранирует до разметки; ссылки не рендерятся; CSP без inline |
| Утечка ключа | Только заголовки, нет логов, redact(), тест: ключ не в URL и не в DOM-тексте кроме поля |
| Импорт чужой истории с HTML | Импорт валидирует форму, всё рендерится через textContent |
| PNG-экспорт и CSS-переменные | Перед сериализацией подставляем вычисленные цвета |
| GitHub Pages: `docs/TZ.md` — папка | Деплой через Actions-артефакт с белым списком файлов, а не «из /docs» |

## 9. Этапы и критерии готовности

### Этап 1 (а): каркас, i18n, темы, дизайн-система, настройки
Файлы: index.html, css/*, core/*, i18n/*, views/ui.js, views/settings.js (без провайдеров — только язык, тема, поля ключей с «Забыть ключ»), icons.svg, .nojekyll.
Готово, когда: страница открывается из `python -m http.server` без ошибок в консоли; nav-пилюля переключает 3 вкладки (клавиатурой тоже); тема Авто/Светлая/Тёмная применяется без мигания и сохраняется; RU/EN переключаются, все строки из словаря; фон анимирован и замирает при reduced-motion; fallback без backdrop-filter выглядит прилично; ширина 360 px без горизонтального скролла; CSP не ругается.

### Этап 2 (б): онбординг и провайдеры
Файлы: providers/*, core/errors.js, views/onboarding.js, расширение settings.js.
Готово, когда: при первом запуске открывается мастер (5 шагов: о приложении → ключ Gemini → проверка → лимиты → OpenRouter опц.), прогресс, назад/далее, Esc/фокус-ловушка; «Проверить подключение» даёт понятный успех/ошибку с подсказкой; списки моделей грузятся у обоих провайдеров, дефолт flash; мастер открывается из настроек; ключ не попадает в URL/консоль.

### Этап 3 (в): анализ видео и вызов модели
Файлы: video/*, ai/*, views/analyze.js (до результата).
Готово, когда: drop/выбор файла, проверка лимитов, извлечение N кадров (6–24, по умолчанию 12) с прогрессом и отменой, метрики-chips, оценка размера запроса; уровень и «что интересует»; один запрос с JSON-схемой; ошибки 400/403/404/413/429 с подсказками; при 429 — кнопка «переключиться и повторить»; parse.js восстанавливает типовой битый JSON (юнит-проверки на наборе фикстур).

### Этап 4 (г): результат, SVG-схема, экспорт
Файлы: render/*, css/result.css, css/print.css.
Готово, когда: все разделы рисуются из JSON, ≈-значки, чекбоксы шагов; граф без наложений на фикстурах (линейная цепочка, ветвление, feedback-цикл, 20 нод), цвета семейств, пунктир, клик нода↔шаг в обе стороны и с клавиатуры; экспорт MD, копирование, печать (белая вёрстка), SVG и PNG схемы; при невалидном JSON — сырой текст через Markdown.

### Этап 5 (д): история и уточняющие вопросы
Файлы: history/db.js, views/history.js, чат в analyze.js.
Готово, когда: разбор сохраняется автоматически (4 миниатюры, без видео); список/открытие/удаление/удалить всё (с подтверждением)/экспорт/импорт; отметки шагов и чат сохраняются; чат: кадры только в первом сообщении, ошибки обрабатываются, история диалога передаётся.

### Этап 6 (е): тесты, README, деплой
Файлы: tests/*, package.json, playwright.config.mjs, .github/workflows/*, README.md.
Готово, когда: Playwright (Chromium) проходит: онбординг, извлечение кадров из ffmpeg-видео (`testsrc2`, 6 с, 640×360), рендер результата и схемы, история, язык, тема, экспорт (download-события), ошибки 400/403/404/429, битый JSON, все сетевые запросы только к замоканным API-хостам, ключ не в URL, нет console.error; скриншоты обеих тем на 1280 и 390 px; тест без мигания (тема на первом кадре = сохранённая); fallback без backdrop-filter (эмуляция через класс/стиль) и проверка контраста токенов; README RU+EN; workflow деплоя Pages.

---

## Заметки по ходу работы
- Этап 0: репозиторий — `C:\Projects\td-explainer.html` (имя папки оставлено как есть). ТЗ лежит в `docs/TZ.md/TZ.md.txt` (папка с именем `TZ.md`). Ветки: `main` (план), работа в `dev`.
- Этап 1: готово. Каркас, токены/стекло/компоненты, i18n (плоские ключи `раздел.ключ`), темы (VT с защитным таймаутом 700 мс), вкладки с хэш-роутингом, настройки ключей. CSP-хэш: `node tools/csp-hash.mjs` после правки инлайн-скрипта. Локальный сервер: `python -m http.server 8765`. Анализ/история — пока заглушки (этапы 3, 5).
- Этап 2: готово. providers/{base,gemini,openrouter,registry}.js — нейтральный формат сообщений `{role, parts:[{text}|{image}]}`, `generate()`; analyze/followUp будут собираться поверх generate в этапе 3 (ai/*). Онбординг 5 шагов (views/onboarding.js), открывается при первом запуске и из настроек. Проверено вживую: фейковые ключи → понятная ошибка badKey у обоих провайдеров (CORS работает).
- Этап 3: готово. video/{extract,metrics,limits}, ai/{prompt,schema,parse,service}, views/analyze.js, render/markdown.js. render/result.js — пока заглушка (JSON), заменить в этапе 4. Проверено в браузере: webm из canvas+MediaRecorder → 12 кадров, метрики, мок Gemini (успех, 429 → «переключиться на OpenRouter»). `node tools/parse-check.mjs` — фикстуры битого JSON.
