// Скриншоты обеих тем на десктопе и 390 px (папка tests/screenshots, в git не хранится).
import { test, expect } from '@playwright/test';
import { mockNetwork, presetStorage, loadTestVideo } from './helpers.mjs';

for (const theme of ['light', 'dark']) {
  for (const width of [1280, 390]) {
    test(`скриншоты: ${theme} ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: width > 500 ? 900 : 844 });
      await mockNetwork(page);
      await presetStorage(page, { theme });
      await page.goto('/index.html#analyze');
      await loadTestVideo(page);
      await page.click('#go');
      await expect(page.locator('.g-node').first()).toBeVisible();
      await page.evaluate(() => document.getAnimations().forEach((a) => { try { a.finish(); } catch { /* бесконечные */ } }));
      const sw = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(sw).toBeLessThanOrEqual(width);
      await page.screenshot({ path: `tests/screenshots/analyze-${theme}-${width}.png`, fullPage: true });
      await page.goto('/index.html#settings');
      await page.screenshot({ path: `tests/screenshots/settings-${theme}-${width}.png`, fullPage: true });
    });
  }
}
