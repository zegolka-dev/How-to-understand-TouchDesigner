// Темы: режим auto | light | dark. Первичное применение делает инлайн-скрипт в <head>.
import { ls, bus } from './store.js';

export const MODES = ['auto', 'light', 'dark'];
const mq = matchMedia('(prefers-color-scheme: dark)');
let mode = 'auto';

export const getThemeMode = () => mode;

function resolved(m) { return m === 'dark' || (m === 'auto' && mq.matches) ? 'dark' : 'light'; }

function apply(animate) {
  const root = document.documentElement;
  const next = resolved(mode);
  const set = () => { root.dataset.theme = next; root.dataset.themeMode = mode; };
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (animate && !reduce && !document.hidden && document.startViewTransition && root.dataset.theme !== next) {
    const vt = document.startViewTransition(set);
    // страховка: переход не должен «зависнуть» и блокировать клики
    const guard = setTimeout(() => { vt.skipTransition?.(); set(); }, 700);
    vt.finished.finally(() => clearTimeout(guard));
  } else set();
  bus.emit('theme', { mode, theme: next });
}

export function setThemeMode(m) {
  if (!MODES.includes(m)) return;
  mode = m;
  ls.set('theme', m);
  apply(true);
}

export function initTheme() {
  const saved = ls.get('theme');
  mode = MODES.includes(saved) ? saved : 'auto';
  apply(false);
  mq.addEventListener('change', () => { if (mode === 'auto') apply(true); });
}
