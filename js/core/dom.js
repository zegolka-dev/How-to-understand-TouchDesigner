// Мини-хелперы DOM. Данные извне (ответы модели, импорт) вставляются только как текст.
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/**
 * h('div.card.glass', {attrs}, ...children) — создание элемента.
 * attrs: class, text, on:{event:fn}, dataset:{}, style:{prop:value} (через CSSOM), прочее -> setAttribute.
 * children: Node | string (как текст) | null | массивы.
 */
export function h(tag, attrs = {}, ...children) {
  const [name, ...classes] = tag.split('.');
  const el = name === 'svg' || attrs.svg ? document.createElementNS('http://www.w3.org/2000/svg', name) : document.createElement(name || 'div');
  if (classes.length) el.classList.add(...classes);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false || k === 'svg') continue;
    if (k === 'class') String(v).split(/\s+/).filter(Boolean).forEach((c) => el.classList.add(c));
    else if (k === 'text') el.textContent = String(v);
    else if (k === 'on') for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'style') for (const [p, val] of Object.entries(v)) el.style.setProperty(p, val);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

const SVGNS = 'http://www.w3.org/2000/svg';
export function svgEl(name, attrs = {}) {
  const el = document.createElementNS(SVGNS, name);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) el.setAttribute(k, String(v));
  return el;
}

/** Иконка из спрайта index.html */
export function icon(id, cls = '') {
  const s = svgEl('svg', { class: ('icon ' + cls).trim(), 'aria-hidden': 'true', focusable: 'false' });
  s.append(svgEl('use', { href: '#i-' + id }));
  return s;
}

export function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Вырезает похожие на ключи строки из любого текста перед выводом. */
export function redact(s) {
  return String(s ?? '').replace(/AIza[0-9A-Za-z_\-]{20,}/g, 'AIza…').replace(/sk-or-[0-9A-Za-z_\-]{10,}/g, 'sk-or-…');
}

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
