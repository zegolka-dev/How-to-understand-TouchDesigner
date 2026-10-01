import { test, expect } from '@playwright/test';
import { mockNetwork, presetStorage, loadTestVideo, collectErrors, geminiOk, FAKE_GEMINI, ANALYSIS } from './helpers.mjs';

test('разбор: кадры, запрос, результат, схема, связь нода↔шаг', async ({ page }) => {
  const errors = collectErrors(page);
  const external = await mockNetwork(page);
  await presetStorage(page);
  await page.goto('/index.html#analyze');
  await loadTestVideo(page);
  await expect(page.locator('#metrics .chip')).toHaveCount(6);
  await page.click('#go');
  await expect(page.locator('#result .res-card').first()).toBeVisible();

  // разделы и граф
  await expect(page.locator('#result .res-card')).toHaveCount(8);
  await expect(page.locator('.g-node')).toHaveCount(8);
  await expect(page.locator('.g-edge.is-back')).toHaveCount(1);
  await expect(page.locator('.g-edge.is-uncertain')).toHaveCount(1);
  await expect(page.locator('.approx').first()).toBeVisible();

  // XSS: текст модели не исполняется
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  await expect(page.locator('#result img')).toHaveCount(0);

  // нода → шаги
  await page.locator('.g-node[data-id="level1"]').click();
  await expect(page.locator('.step.is-linked')).toHaveCount(1);
  // шаг → ноды
  await page.locator('.step__title').nth(1).click();
  await expect(page.locator('.g-node.is-active')).toHaveCount(2);
  // клавиатура
  await page.locator('.g-node[data-id="circle1"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.step.is-linked .step__title')).toHaveText('Круг');

  // чекбокс шага
  await page.locator('.step .switch').first().check();
  await expect(page.locator('.step.is-done')).toHaveCount(1);

  // ключ: только в заголовке, не в URL
  const gen = external.find((r) => r.url.includes(':generateContent'));
  expect(gen.url).not.toContain(FAKE_GEMINI);
  expect(gen.headers['x-goog-api-key']).toBe(FAKE_GEMINI);
  const body = JSON.parse(gen.body);
  expect(body.generationConfig.responseMimeType).toBe('application/json');
  expect(body.contents[0].parts.filter((p) => p.inline_data).length).toBe(12);
  expect(external.every((r) => /generativelanguage\.googleapis\.com|openrouter\.ai/.test(r.url))).toBe(true);
  expect(errors).toEqual([]);
});

test('экспорт: Markdown, SVG, PNG, копирование', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await mockNetwork(page);
  await presetStorage(page);
  await page.goto('/index.html#analyze');
  await loadTestVideo(page);
  await page.click('#go');
  await expect(page.locator('.g-node').first()).toBeVisible();

  const [md] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Markdown' }).click()]);
  expect(md.suggestedFilename()).toMatch(/\.md$/);
  const text = await (await md.createReadStream()).toArray().then((c) => Buffer.concat(c).toString('utf8'));
  expect(text).toContain('Circle TOP');
  expect(text).toContain('circle1 -> transform1');

  const [svg] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'SVG' }).click()]);
  const svgText = await (await svg.createReadStream()).toArray().then((c) => Buffer.concat(c).toString('utf8'));
  expect(svgText).toContain('<svg');
  expect(svgText).not.toContain('var(--');

  const [png] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'PNG' }).click()]);
  expect(png.suggestedFilename()).toMatch(/\.png$/);

  await page.getByRole('button', { name: 'Копировать' }).click();
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip).toContain('Пошаговая инструкция');
});

test('битый JSON: восстановление и сырой текст', async ({ page }) => {
  let mode = 'truncated';
  await mockNetwork(page, {
    gemini: (route, url) => {
      if (url.pathname.endsWith('/models')) return route.fulfill({ json: { models: [] } });
      const full = JSON.stringify(ANALYSIS);
      const text = mode === 'truncated' ? full.slice(0, full.indexOf('"steps"') + 60) : 'Извините, вот ответ текстом:\n## Заголовок\n- пункт <script>window.__xss=1</script>';
      return route.fulfill({ json: geminiOk(text) });
    },
  });
  await presetStorage(page);
  await page.goto('/index.html#analyze');
  await loadTestVideo(page);
  await page.click('#go');
  await expect(page.locator('.g-node').first()).toBeVisible();
  await expect(page.locator('#run-status')).toContainText('починить');

  mode = 'raw';
  await page.click('#go');
  await expect(page.locator('.res-raw')).toBeVisible();
  await expect(page.locator('.res-raw h3')).toHaveText('Заголовок');
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();
});
