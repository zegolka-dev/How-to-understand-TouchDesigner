// Точка входа.
import { $$ } from './core/dom.js';
import { bus } from './core/store.js';
import { initI18n, setLang, getLang } from './core/i18n.js';
import { initTheme, setThemeMode, getThemeMode } from './core/theme.js';
import { segmented, initNav } from './views/ui.js';
import { initSettings } from './views/settings.js';
import { openOnboarding, needsOnboarding } from './views/onboarding.js';

function initRefraction() {
  // Преломление через SVG-фильтр в backdrop-filter стабильно работает только в Chromium.
  const brands = navigator.userAgentData?.brands?.map((b) => b.brand) || [];
  const chromium = brands.some((b) => /Chromium|Google Chrome|Microsoft Edge/.test(b));
  const calm = matchMedia('(prefers-reduced-transparency: reduce), (prefers-contrast: more)').matches;
  document.documentElement.classList.toggle('refract', chromium && !calm);
}

function initSegments() {
  const themeSegs = $$('[data-seg="theme"]').map((el) => segmented(el, { value: getThemeMode(), onChange: setThemeMode }));
  const langSegs = $$('[data-seg="lang"]').map((el) => segmented(el, { value: getLang(), onChange: setLang }));
  bus.on('theme', ({ mode }) => themeSegs.forEach((s) => s.set(mode)));
  bus.on('lang', (l) => { langSegs.forEach((s) => s.set(l)); allSegs().forEach((s) => s.place()); });
  return () => [...themeSegs, ...langSegs];
}

let allSegs = () => [];
let nav;

function start() {
  initTheme();
  initI18n();
  initRefraction();
  allSegs = initSegments();
  nav = initNav(() => requestAnimationFrame(() => allSegs().forEach((s) => s.place())));
  bus.on('lang', () => nav.place());
  initSettings();
  if (needsOnboarding()) openOnboarding();
}

start();
