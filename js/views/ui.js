// Общие UI-компоненты: сегментированный контрол/вкладки, листы (sheets), тосты.
import { h, icon, $, $$ } from '../core/dom.js';
import { t } from '../core/i18n.js';

/**
 * Сегментированный контрол со скользящей подложкой.
 * root: .seg с кнопками .seg__opt[data-value] (role=radio или role=tab) и .seg__thumb.
 */
export function segmented(root, { value, onChange } = {}) {
  const opts = $$('.seg__opt', root);
  const thumb = $('.seg__thumb', root);
  const isTab = opts[0]?.getAttribute('role') === 'tab';
  const attr = isTab ? 'aria-selected' : 'aria-checked';
  let current = value ?? opts[0]?.dataset.value;
  let first = true;

  function place() {
    const btn = opts.find((o) => o.dataset.value === current);
    if (!btn || !thumb || !btn.offsetWidth) return;
    if (first) thumb.classList.add('no-anim');
    thumb.style.setProperty('--x', btn.offsetLeft - 3 + 'px');
    thumb.style.setProperty('--w', btn.offsetWidth + 'px');
    if (first) { void thumb.offsetWidth; thumb.classList.remove('no-anim'); first = false; }
  }

  function render() {
    for (const o of opts) {
      const on = o.dataset.value === current;
      o.setAttribute(attr, String(on));
      o.tabIndex = on ? 0 : -1;
    }
    place();
  }

  function select(v, focus = false) {
    if (!opts.some((o) => o.dataset.value === v)) return;
    const changed = v !== current;
    current = v;
    render();
    if (focus) opts.find((o) => o.dataset.value === v)?.focus();
    if (changed) onChange?.(v);
  }

  for (const o of opts) o.addEventListener('click', () => select(o.dataset.value));
  root.addEventListener('keydown', (e) => {
    const i = opts.findIndex((o) => o.dataset.value === current);
    let j = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % opts.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i - 1 + opts.length) % opts.length;
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = opts.length - 1;
    if (j !== null) { e.preventDefault(); select(opts[j].dataset.value, true); }
  });
  new ResizeObserver(place).observe(root);
  render();
  return { set: (v) => { current = v; render(); }, get: () => current, place };
}

/* ---------------- Статусы и ошибки ---------------- */
const WITH_DETAIL = ['badRequest', 'server', 'forbidden', 'blocked', 'empty', 'region', 'quota'];

/** Человекочитаемый текст ошибки (AppError или любой). Детали от API выводятся только как текст. */
export function errorText(e) {
  const code = e?.code || 'network';
  let msg = t('err.' + code);
  if (msg === 'err.' + code) msg = t('err.network');
  if (e?.detail && WITH_DETAIL.includes(code)) msg += ' — ' + e.detail;
  return msg;
}

/** Статусная строка: type = ok | err | warn | busy | '' */
export function setStatus(el, type, text) {
  if (!el) return;
  el.className = 'status' + (type && type !== 'busy' ? ' status--' + type : '');
  el.replaceChildren();
  if (!text) return;
  if (type === 'busy') el.append(h('span.spinner', { 'aria-hidden': 'true' }));
  else if (type) el.append(icon(type === 'ok' ? 'check' : type === 'err' ? 'alert' : 'info', 'icon--sm'));
  el.append(h('span', { text }));
}

/* ---------------- Тосты ---------------- */
export function toast(message, { type = 'info', action, timeout = 5000 } = {}) {
  const box = $('#toasts');
  const ic = { ok: 'check', err: 'alert', info: 'info', warn: 'alert' }[type] || 'info';
  const el = h('div.toast.glass', { class: 'toast--' + type }, icon(ic), h('span.toast__text', { text: message }));
  const close = () => el.remove();
  if (action) {
    el.append(h('button.btn.btn--secondary.btn--sm', { type: 'button', text: action.label, on: { click: () => { close(); action.fn(); } } }));
    timeout = Math.max(timeout, 10000);
  }
  el.append(h('button.btn.btn--ghost.btn--sm.btn--icon', { type: 'button', 'aria-label': t('common.close'), on: { click: close } }, icon('x', 'icon--sm')));
  box.append(el);
  if (timeout) setTimeout(close, timeout);
  return close;
}

/* ---------------- Листы (модальные окна) ---------------- */
let openCount = 0;
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * openSheet({ title, body: Node, footer: Node[], onClose, dismissible })
 * Возвращает { close, sheet, setTitle }.
 */
export function openSheet({ title = '', body, footer = [], onClose, dismissible = true, className = '' } = {}) {
  const prevFocus = document.activeElement;
  const id = 'sheet-title-' + Math.random().toString(36).slice(2, 8);
  const titleEl = h('h2', { id, text: title });
  const head = h('div.sheet__head', {}, titleEl,
    dismissible ? h('button.btn.btn--ghost.btn--icon', { type: 'button', 'aria-label': t('common.close'), on: { click: () => close() } }, icon('x')) : null);
  const sheet = h('div.sheet.glass--refract', { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': id, class: className }, head, body,
    footer.length ? h('div.sheet__foot', {}, footer) : null);
  const backdrop = h('div.sheet-backdrop', {}, sheet);
  if (dismissible) backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) close(); });

  const outside = [$('header.topbar'), $('main'), $('.skip-link')].filter(Boolean);
  outside.forEach((el) => { el.inert = true; });
  openCount++;
  document.body.append(backdrop);
  requestAnimationFrame(() => { backdrop.dataset.state = 'open'; });

  function onKey(e) {
    if (e.key === 'Escape' && dismissible) { e.preventDefault(); close(); }
    if (e.key === 'Tab') {
      const f = $$(FOCUSABLE, sheet).filter((x) => x.offsetParent !== null);
      if (!f.length) return;
      const firstEl = f[0], lastEl = f[f.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus(); }
      else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus(); }
    }
  }
  backdrop.addEventListener('keydown', onKey);
  setTimeout(() => ($$(FOCUSABLE, body)[0] || $$(FOCUSABLE, sheet)[0])?.focus(), 30);

  let closed = false;
  function close(result) {
    if (closed) return; closed = true;
    backdrop.removeAttribute('data-state');
    setTimeout(() => backdrop.remove(), 220);
    if (--openCount === 0) outside.forEach((el) => { el.inert = false; });
    prevFocus?.focus?.();
    onClose?.(result);
  }
  return { close, sheet, setTitle: (s) => { titleEl.textContent = s; } };
}

/** Подтверждение: resolve(true|false) */
export function confirmSheet({ title, text, okLabel, danger = false }) {
  return new Promise((resolve) => {
    let result = false;
    const ok = h('button.btn.btn--primary', { type: 'button', text: okLabel || t('common.ok'), class: danger ? 'btn--danger-fill' : '' });
    const cancel = h('button.btn.btn--secondary', { type: 'button', text: t('common.cancel') });
    const s = openSheet({ title, body: h('p.muted', { text }), footer: [cancel, ok], onClose: () => resolve(result) });
    ok.addEventListener('click', () => { result = true; s.close(); });
    cancel.addEventListener('click', () => s.close());
  });
}

/* ---------------- Навигация по вкладкам ---------------- */
export const VIEWS = ['analyze', 'history', 'settings'];

export function initNav(onChange) {
  const nav = $('#nav');
  const fromHash = () => (VIEWS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'analyze');
  const show = (v) => {
    for (const name of VIEWS) $('#view-' + name).hidden = name !== v;
    onChange?.(v);
  };
  const seg = segmented(nav, {
    value: fromHash(),
    onChange: (v) => { history.replaceState(null, '', '#' + v); show(v); },
  });
  window.addEventListener('hashchange', () => { const v = fromHash(); seg.set(v); show(v); });
  show(fromHash());
  return { go: (v) => { history.replaceState(null, '', '#' + v); seg.set(v); show(v); }, place: seg.place };
}
