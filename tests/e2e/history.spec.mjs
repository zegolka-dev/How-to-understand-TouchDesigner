import { test, expect } from '@playwright/test';
import { mockNetwork, presetStorage, loadTestVideo, collectErrors, geminiOk } from './helpers.mjs';

test('история: сохранение, открытие, чат, экспорт/импорт, удаление', async ({ page }) => {
  const errors = collectErrors(page);
  const external = await mockNetwork(page, {
    gemini: (route, url, req) => {
      if (url.pathname.endsWith('/models')) return route.fulfill({ json: { models: [] } });
      const body = JSON.parse(req.postData());
      if (body.generationConfig.responseMimeType) return route.fulfill({ json: geminiOk() });
      return route.fulfill({ json: geminiOk('Поставьте **Opacity** `0.9`.') });
    },
  });
  await presetStorage(page);
  await page.goto('/index.html#analyze');
  await loadTestVideo(page);
  await page.click('#go');
  await expect(page.locator('.chat')).toBeVisible();

  // уточняющий вопрос в живой сессии: кадры только в первом сообщении
  await page.fill('#chat-input', 'Как настроить шлейф?');
  await page.click('.chat .btn--primary');
  await expect(page.locator('.msg--model')).toContainText('Opacity');
  const chatReq = JSON.parse(external.filter((r) => r.url.includes(':generateContent')).at(-1).body);
  const images = chatReq.contents.flatMap((c) => c.parts).filter((p) => p.inline_data).length;
  expect(images).toBe(12);
  expect(chatReq.contents.at(-1).parts[0].text).toBe('Как настроить шлейф?');
  expect(chatReq.generationConfig.responseMimeType).toBeUndefined();

  // отметка шага сохраняется
  await page.locator('.step .switch').nth(1).check();

  // история
  await page.click('#tab-history');
  await expect(page.locator('.hcard')).toHaveCount(1);
  await expect(page.locator('.hcard__thumbs img')).toHaveCount(4);

  // экспорт
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Экспорт' }).click()]);
  const json = JSON.parse(await (await dl.createReadStream()).toArray().then((c) => Buffer.concat(c).toString('utf8')));
  expect(json.items).toHaveLength(1);
  expect(json.items[0].doneSteps).toEqual([2]);
  expect(json.items[0].chat).toHaveLength(2);
  expect(JSON.stringify(json)).not.toContain('AIza');

  // открыть из истории: результат, отметки, чат без кадров
  await page.reload();
  await page.click('#tab-history');
  await page.getByRole('button', { name: 'Открыть' }).click();
  await expect(page.locator('#result .g-node').first()).toBeVisible();
  await expect(page.locator('.step.is-done')).toHaveCount(1);
  await expect(page.locator('.msg--model')).toHaveCount(1);
  await page.fill('#chat-input', 'А цвет?');
  await page.click('.chat .btn--primary');
  await expect(page.locator('.msg--model')).toHaveCount(2);
  const histReq = JSON.parse(external.filter((r) => r.url.includes(':generateContent')).at(-1).body);
  expect(histReq.contents.flatMap((c) => c.parts).filter((p) => p.inline_data).length).toBe(0);

  // удалить всё + импорт обратно (вредоносные поля отфильтровываются)
  await page.click('#tab-history');
  await page.getByRole('button', { name: 'Удалить всё' }).click();
  await page.locator('.sheet .btn--primary').click();
  await expect(page.locator('.history__empty')).toBeVisible();
  json.items[0].thumbs.push('javascript:alert(1)');
  json.items[0].metrics.palette = ['#ff0000', 'url(https://evil.example)'];
  await page.locator('#view-history input[type=file]').setInputFiles({ name: 'h.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(json)) });
  await expect(page.locator('.hcard')).toHaveCount(1);
  await page.getByRole('button', { name: 'Открыть' }).click();
  await expect(page.locator('#result .g-node').first()).toBeVisible();

  // удалить одну
  await page.click('#tab-history');
  await page.getByRole('button', { name: /^Удалить разбор/ }).click();
  await page.locator('.sheet .btn--primary').click();
  await expect(page.locator('.history__empty')).toBeVisible();

  // битый файл
  await page.locator('#view-history input[type=file]').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{oops') });
  await expect(page.locator('.toast--err')).toContainText('не файл истории');
  expect(errors).toEqual([]);
});
