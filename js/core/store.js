// Безопасная обёртка над localStorage и общая шина событий.
const PREFIX = 'tdx.';

export const ls = {
  get(key, fallback = null) {
    try { const v = localStorage.getItem(PREFIX + key); return v === null ? fallback : v; } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(PREFIX + key, String(value)); return true; } catch { return false; }
  },
  remove(key) {
    try { localStorage.removeItem(PREFIX + key); } catch { /* недоступно */ }
  },
  getJSON(key, fallback = null) {
    const raw = this.get(key);
    if (raw === null) return fallback;
    try { return JSON.parse(raw); } catch { return fallback; }
  },
  setJSON(key, value) { return this.set(key, JSON.stringify(value)); },
};

// Шина: bus.on('theme', fn) / bus.emit('theme', detail)
const target = new EventTarget();
export const bus = {
  on(type, fn) { const h = (e) => fn(e.detail); target.addEventListener(type, h); return () => target.removeEventListener(type, h); },
  emit(type, detail) { target.dispatchEvent(new CustomEvent(type, { detail })); },
};
