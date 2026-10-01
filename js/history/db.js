// История разборов в IndexedDB. Видео не хранится: только результат, 3–4 миниатюры и метаданные.
import { normalize } from '../ai/parse.js';

const DB = 'tdx', STORE = 'analyses', VERSION = 1;
export const MAX_IMPORT = 50 * 1024 * 1024;
let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' }).createIndex('createdAt', 'createdAt');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { dbp = null; reject(req.error); };
  });
  return dbp;
}

async function tx(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    let result;
    Promise.resolve(fn(store)).then((r) => { result = r; });
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}
const req2p = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export const putRecord = (rec) => tx('readwrite', (s) => req2p(s.put(clean(rec))));
export const getRecord = (id) => tx('readonly', (s) => req2p(s.get(id)));
export const removeRecord = (id) => tx('readwrite', (s) => req2p(s.delete(id)));
export const clearAll = () => tx('readwrite', (s) => req2p(s.clear()));
export async function listRecords() {
  const all = await tx('readonly', (s) => req2p(s.getAll()));
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function exportAll() {
  const items = await listRecords();
  return { app: 'td-explainer', v: 1, exportedAt: Date.now(), items };
}

/* ---------- валидация (импорт может содержать что угодно) ---------- */
const HEX = /^#[0-9a-f]{6}$/i;
const IMG = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const num = (v, d = 0) => (typeof v === 'number' && isFinite(v) ? v : d);
const s = (v, max = 2000) => (typeof v === 'string' ? v.slice(0, max) : '');

/** Приводит запись к ожидаемой форме; бросает, если это явно не запись. */
export function clean(r) {
  if (!r || typeof r !== 'object') throw new Error('bad record');
  const m = r.metrics && typeof r.metrics === 'object' ? r.metrics : {};
  return {
    id: s(r.id, 80) || crypto.randomUUID(),
    v: 1,
    createdAt: num(r.createdAt, Date.now()),
    fileName: s(r.fileName, 260),
    provider: ['gemini', 'openrouter'].includes(r.provider) ? r.provider : 'gemini',
    model: s(r.model, 200),
    lang: r.lang === 'ru' ? 'ru' : 'en',
    level: ['beginner', 'mid', 'pro'].includes(r.level) ? r.level : 'mid',
    note: s(r.note, 500),
    metrics: {
      duration: num(m.duration), w: num(m.w), h: num(m.h), motion: num(m.motion), motionLevel: Math.max(0, Math.min(3, num(m.motionLevel))),
      loopDiff: num(m.loopDiff, 1), looped: m.looped === true, brightness: num(m.brightness),
      palette: Array.isArray(m.palette) ? m.palette.filter((c) => HEX.test(c)).slice(0, 5) : [],
    },
    thumbs: Array.isArray(r.thumbs) ? r.thumbs.filter((x) => typeof x === 'string' && x.length < 400000 && IMG.test(x)).slice(0, 4) : [],
    result: r.result && typeof r.result === 'object' ? normalize(r.result) : null,
    raw: r.result ? null : s(r.raw, 200000),
    repaired: r.repaired === true,
    chat: Array.isArray(r.chat) ? r.chat.filter((c) => c && (c.role === 'user' || c.role === 'model') && typeof c.text === 'string').map((c) => ({ role: c.role, text: c.text.slice(0, 50000) })).slice(-100) : [],
    doneSteps: Array.isArray(r.doneSteps) ? r.doneSteps.filter((n) => Number.isInteger(n) && n > 0 && n < 1000) : [],
  };
}

/** Импорт файла истории. Возвращает число добавленных записей. */
export async function importFile(file) {
  if (file.size > MAX_IMPORT) throw new Error('tooBig');
  let data;
  try { data = JSON.parse(await file.text()); } catch { throw new Error('badFile'); }
  if (!data || data.app !== 'td-explainer' || !Array.isArray(data.items)) throw new Error('badFile');
  const existing = new Set((await listRecords()).map((r) => r.id));
  let added = 0;
  for (const item of data.items) {
    let rec;
    try { rec = clean(item); } catch { continue; }
    if (existing.has(rec.id)) rec.id = crypto.randomUUID();
    await putRecord(rec);
    existing.add(rec.id);
    added++;
  }
  return added;
}
