import { test, expect } from '@playwright/test';
import { mockNetwork, presetStorage, loadTestVideo, collectErrors, FAKE_GEMINI, FAKE_OR, geminiModels, geminiOk } from './helpers.mjs';

test.describe('онбординг', () => {
  test.use({ locale: 'ru-RU' });

  test('первый запуск без ключа: мастер, назад/далее, проверка подключения', async ({ page }) => {
    const errors = collectErrors(page);
    let bad = true;
    await mockNetwork(page, {
      gemini: (route, url) => (bad
        ? route.fulfill({ status: 400, json: { error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT' } } })
        : route.fulfill({ json: geminiModels })),
    });
    await page.goto('/index.html');
    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText('Шаг 1 из 5');
    await sheet.getByRole('button', { name: 'Далее' }).click();
    await expect(sheet).toContainText('Create API key');
    await expect(sheet.getByRole('link', { name: /Открыть страницу/ })).toHaveAttribute('href', 'https://aistudio.google.com/apikey');
    await sheet.getByRole('button', { name: 'Назад' }).click();
    await expect(sheet).toContainText('Шаг 1 из 5');
    await sheet.getByRole('button', { name: 'Далее' }).click();
    await sheet.getByLabel('API-ключ').fill(FAKE_GEMINI);
    await sheet.getByRole('button', { name: 'Далее' }).click();
    await sheet.getByRole('button', { name: 'Проверить подключение' }).click();
    await expect(sheet.locator('.status--err')).toContainText('Ключ не подходит');
    bad = false;
    await sheet.getByRole('button', { name: 'Проверить подключение' }).click();
    await expect(sheet.locator('.status--ok')).toContainText('gemini-9.9-flash');
    await sheet.getByRole('button', { name: 'Далее' }).click();
    await expect(sheet).toContainText('лимит');
    await sheet.getByRole('button', { name: 'Далее' }).click();
    await expect(sheet).toContainText('OpenRouter');
    await sheet.getByRole('button', { name: 'Пропустить' }).click();
    await expect(sheet).toBeHidden();
    // ключ не выводится в текст страницы и не попадает в URL
    expect(await page.evaluate(() => document.body.innerText)).not.toContain(FAKE_GEMINI);
    expect(page.url()).not.toContain('AIza');
    await page.reload();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    // мастер открывается из настроек
    await page.click('#tab-settings');
    await page.getByRole('button', { name: 'Открыть мастер настройки' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(errors.filter((e) => !/status of 400/.test(e))).toEqual([]);
  });
});

test.describe('язык и тема', () => {
  test.use({ locale: 'en-US' });

  test('язык по браузеру, переключение RU/EN, тема сохраняется', async ({ page }) => {
    await mockNetwork(page);
    await page.addInitScript(() => { localStorage.setItem('tdx.onboarded', '1'); });
    await page.goto('/index.html');
    await expect(page.locator('#tab-analyze')).toHaveText('Analyze');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await page.locator('header [data-seg="lang"] [data-value="ru"]').click();
    await expect(page.locator('#tab-analyze')).toHaveText('Разбор');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
    // клавиатура в сегментированном контроле
    await page.locator('header [data-seg="theme"] [aria-checked="true"]').focus();
    await page.locator('header [data-seg="theme"] [data-value="dark"]').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.locator('header [data-seg="theme"] [data-value="dark"]').click();
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('#tab-analyze')).toHaveText('Разбор');
    // вкладки стрелками
    await page.locator('#tab-analyze').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#view-history')).toBeVisible();
  });

  test('нет мигания темы: тёмная тема стоит до загрузки скриптов', async ({ page }) => {
    await page.addInitScript(() => { localStorage.setItem('tdx.theme', 'dark'); localStorage.setItem('tdx.onboarded', '1'); });
    let release;
    const gate = new Promise((r) => { release = r; });
    await page.route('**/js/main.js', async (route) => { await gate; await route.continue(); });
    await page.goto('/index.html', { waitUntil: 'commit' });
    await page.waitForSelector('body');
    // ждём стили (main.js всё ещё задержан, значит тему поставил только инлайн-скрипт)
    await page.waitForFunction(() => getComputedStyle(document.body).backgroundColor !== 'rgba(0, 0, 0, 0)');
    const before = await page.evaluate(() => ({ theme: document.documentElement.dataset.theme, bg: getComputedStyle(document.body).backgroundColor }));
    release();
    expect(before.theme).toBe('dark');
    expect(before.bg).toBe('rgb(7, 8, 13)');
  });

  test('авто-тема следует prefers-color-scheme', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.addInitScript(() => localStorage.setItem('tdx.onboarded', '1'));
    await page.goto('/index.html');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });
});

test.describe('ошибки API', () => {
  const cases = [
    { status: 400, body: { error: { code: 400, message: 'API key not valid', status: 'INVALID_ARGUMENT' } }, text: 'Ключ не подходит' },
    { status: 403, body: { error: { code: 403, message: 'Permission denied', status: 'PERMISSION_DENIED' } }, text: 'Доступ запрещён' },
    { status: 404, body: { error: { code: 404, message: 'models/x is not found', status: 'NOT_FOUND' } }, text: 'Такой модели нет' },
    { status: 429, body: { error: { code: 429, message: 'Resource has been exhausted', status: 'RESOURCE_EXHAUSTED' } }, text: 'Лимит бесплатного тарифа' },
  ];
  for (const c of cases) {
    test(`HTTP ${c.status}`, async ({ page }) => {
      await mockNetwork(page, { gemini: (route) => route.fulfill({ status: c.status, json: c.body }) });
      await presetStorage(page);
      await page.goto('/index.html#analyze');
      await loadTestVideo(page);
      await page.click('#go');
      await expect(page.locator('#run-status')).toContainText(c.text);
      await expect(page.locator('#go')).toBeEnabled();
    });
  }

  test('503 «high demand»: автоматически пробует следующую модель и запоминает её', async ({ page }) => {
    const hits = [];
    await mockNetwork(page, {
      gemini: (route, url) => {
        hits.push(url.pathname);
        if (url.pathname.includes('gemini-9.9-flash:')) return route.fulfill({ status: 503, json: { error: { code: 503, message: 'This model is currently experiencing high demand.', status: 'UNAVAILABLE' } } });
        return route.fulfill({ json: geminiOk() });
      },
    });
    const models = JSON.stringify(geminiModels.models.slice(0, 3).map((m) => ({ id: m.name.slice(7), label: m.name.slice(7) })));
    await presetStorage(page, { 'gemini.models': models });
    await page.goto('/index.html#analyze');
    await loadTestVideo(page);
    await page.click('#go');
    await expect(page.locator('#result .g-node').first()).toBeVisible({ timeout: 20000 });
    expect(hits.filter((p) => p.includes('gemini-9.9-flash:')).length).toBe(2); // запрос + автоповтор
    expect(hits.some((p) => p.includes('gemini-9.9-flash-lite:'))).toBe(true);
    await expect(page.locator('#quick-model')).toHaveValue('gemini-9.9-flash-lite');
    await expect(page.locator('#provider-line')).toContainText('lite');
  });

  test('все модели в лимите: понятная ошибка, список опробованных, запасной провайдер', async ({ page }) => {
    await mockNetwork(page, { gemini: (route) => route.fulfill({ status: 429, json: { error: { code: 429, message: 'Quota exceeded for metric: generate_content_free_tier_requests', status: 'RESOURCE_EXHAUSTED' } } }) });
    const models = JSON.stringify(geminiModels.models.slice(0, 3).map((m) => ({ id: m.name.slice(7), label: m.name.slice(7) })));
    await presetStorage(page, { 'gemini.models': models, 'openrouter.key': FAKE_OR, 'openrouter.model': 'google/gemma-test:free' });
    await page.goto('/index.html#analyze');
    await loadTestVideo(page);
    await page.click('#go');
    await expect(page.locator('#run-status')).toContainText('Пробовал модели: gemini-9.9-flash, gemini-9.9-flash-lite, gemini-9.9-pro');
    await expect(page.locator('#run-status')).toContainText('generate_content_free_tier_requests');
    await expect(page.getByRole('button', { name: /Попробовать модель/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Переключиться на OpenRouter и повторить' })).toBeVisible();
  });

  test('429 → переключение на OpenRouter одним кликом', async ({ page }) => {
    const external = await mockNetwork(page, { gemini: (route) => route.fulfill({ status: 429, json: { error: { code: 429, message: 'quota', status: 'RESOURCE_EXHAUSTED' } } }) });
    await presetStorage(page, { 'openrouter.key': FAKE_OR, 'openrouter.model': 'google/gemma-test:free' });
    await page.goto('/index.html#analyze');
    await loadTestVideo(page);
    await page.click('#go');
    await page.getByRole('button', { name: 'Переключиться на OpenRouter и повторить' }).click();
    await expect(page.locator('#result .g-node').first()).toBeVisible();
    const or = external.find((r) => r.url.includes('openrouter.ai/api/v1/chat/completions'));
    expect(or.headers.authorization).toBe('Bearer ' + FAKE_OR);
    const body = JSON.parse(or.body);
    expect(body.messages[1].content.filter((p) => p.type === 'image_url')).toHaveLength(12);
    await expect(page.locator('#provider-line')).toContainText('OpenRouter');
  });
});

test.describe('стекло и контраст', () => {
  test('fallback без backdrop-filter: почти непрозрачные поверхности', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('tdx.onboarded', '1'));
    await page.goto('/index.html#settings');
    await page.evaluate(() => document.documentElement.classList.add('no-glass'));
    const s = await page.evaluate(() => {
      const el = document.querySelector('.card.glass');
      const cs = getComputedStyle(el);
      return { bf: cs.backdropFilter, bg: cs.backgroundColor };
    });
    expect(s.bf).toBe('none');
    const alpha = Number((s.bg.match(/rgba?\(([^)]+)\)/)[1].split(',')[3] ?? '1'));
    expect(alpha).toBeGreaterThanOrEqual(0.9);
  });

  test('контраст текста на плотном стекле ≥ 4.5:1 в обеих темах (на фоне и на цветных пятнах)', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('tdx.onboarded', '1'));
    await page.goto('/index.html');
    for (const theme of ['light', 'dark']) {
      const worst = await page.evaluate((theme) => {
        document.documentElement.dataset.theme = theme;
        const v = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
        const parse = (c) => {
          if (c.startsWith('#')) return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16), 1];
          const p = c.match(/\(([^)]+)\)/)[1].split(',').map((x) => parseFloat(x));
          return [p[0], p[1], p[2], p[3] ?? 1];
        };
        const over = (top, bottom) => [0, 1, 2].map((i) => top[i] * top[3] + bottom[i] * (1 - top[3])).concat(1);
        const lum = (c) => { const [r, g, b] = c.slice(0, 3).map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
        const ratio = (a, b) => { const [h, l] = [lum(a), lum(b)].sort((x, y) => y - x); return (h + 0.05) / (l + 0.05); };
        const bg = parse(v('--bg'));
        const blobOpacity = parseFloat(v('--blob-opacity'));
        const backdrops = [bg, ...[1, 2, 3, 4].map((i) => { const b = parse(v('--blob-' + i)); b[3] = blobOpacity; return over(b, bg); })];
        const fill = parse(v('--glass-fill-dense'));
        let min = 99;
        for (const back of backdrops) {
          const surface = over(fill, back);
          for (const t of ['--text', '--text-2', '--text-3']) min = Math.min(min, ratio(parse(v(t)), surface));
        }
        return min;
      }, theme);
      expect(worst, theme).toBeGreaterThanOrEqual(4.5);
    }
  });
});

test('быстрое переключение провайдера и модели на экране разбора', async ({ page }) => {
  const external = await mockNetwork(page);
  await presetStorage(page, { 'openrouter.key': FAKE_OR, 'provider.active': 'openrouter', 'openrouter.model': 'google/gemma-test:free' });
  await page.goto('/index.html#analyze');
  await expect(page.locator('#provider-line')).toContainText('OpenRouter заметно слабее');
  await page.locator('[data-seg="quick-provider"] [data-value="gemini"]').click();
  await expect(page.locator('#quick-model option')).toHaveCount(3); // загружено через ListModels
  await page.selectOption('#quick-model', 'gemini-9.9-flash');
  await expect(page.locator('#provider-line')).toContainText('Google Gemini · gemini-9.9-flash');
  await loadTestVideo(page);
  await page.click('#go');
  await expect(page.locator('p.res-summary')).toBeVisible();
  await expect(page.locator('section.res-summary .res-list li')).toHaveCount(3);
  expect(external.some((r) => r.url.includes('gemini-9.9-flash:generateContent'))).toBe(true);
  // промт просит сначала наблюдения
  const body = JSON.parse(external.find((r) => r.url.includes(':generateContent')).body);
  expect(body.generationConfig.responseSchema.propertyOrdering[0]).toBe('observations');
  // настройки синхронизированы
  await page.click('#tab-settings');
  await expect(page.locator('[data-seg="provider"] [data-value="gemini"]')).toHaveAttribute('aria-checked', 'true');
});
