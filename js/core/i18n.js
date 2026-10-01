// Словари и перевод интерфейса. Все строки UI берутся отсюда.
import ru from '../i18n/ru.js';
import en from '../i18n/en.js';
import { ls, bus } from './store.js';

export const DICTS = { ru, en };
export const LANGS = ['ru', 'en'];
let lang = 'en';

export function detectLang() {
  const saved = ls.get('lang');
  if (LANGS.includes(saved)) return saved;
  const list = navigator.languages?.length ? navigator.languages : [navigator.language || 'en'];
  for (const l of list) {
    const c = String(l).slice(0, 2).toLowerCase();
    if (['ru', 'uk', 'be', 'kk'].includes(c)) return 'ru';
    if (c === 'en') return 'en';
  }
  return 'en';
}

export const getLang = () => lang;

/** t('key', {n: 3, name: 'x'}) — значения-объекты считаются формами множественного числа. */
export function t(key, vars) {
  let s = DICTS[lang][key] ?? DICTS.en[key];
  if (s === undefined) return key;
  if (typeof s === 'object') {
    const n = vars?.n ?? 0;
    s = s[new Intl.PluralRules(lang).select(n)] ?? s.other;
  }
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  return s;
}

/** Применяет переводы к [data-i18n] (textContent) и [data-i18n-attr="attr:key;attr2:key2"]. */
export function applyI18n(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-attr]')) {
    for (const pair of el.dataset.i18nAttr.split(';')) {
      const [attr, key] = pair.split(':').map((x) => x.trim());
      if (attr && key) el.setAttribute(attr, t(key));
    }
  }
}

export function setLang(next, { save = true } = {}) {
  if (!LANGS.includes(next)) return;
  lang = next;
  if (save) ls.set('lang', next);
  document.documentElement.lang = next;
  document.title = t('app.docTitle');
  document.querySelector('meta[name="description"]')?.setAttribute('content', t('app.tagline'));
  applyI18n();
  bus.emit('lang', next);
}

export function initI18n() {
  setLang(detectLang(), { save: false });
}

/** Форматирование чисел/дат под текущий язык */
export const fmtNum = (n, opts) => new Intl.NumberFormat(lang, opts).format(n);
export const fmtDate = (ts) => new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' }).format(ts);
export function fmtBytes(b) {
  const units = lang === 'ru' ? ['Б', 'КБ', 'МБ', 'ГБ'] : ['B', 'KB', 'MB', 'GB'];
  let i = 0; while (b >= 1024 && i < units.length - 1) { b /= 1024; i++; }
  return fmtNum(b, { maximumFractionDigits: i ? 1 : 0 }) + ' ' + units[i];
}
