// Разбор ответа модели: JSON → валидация/нормализация, с мягким восстановлением битого JSON.
import { FAMILIES } from './schema.js';

const MAX_STR = 4000;

/** Снимает ```json ограждения и берёт фрагмент от первой { */
function strip(text) {
  let s = String(text || '').trim();
  const fence = s.match(/```(?:json|JSON)?\s*([\s\S]*?)(?:```|$)/);
  if (fence && fence[1].includes('{')) s = fence[1];
  const start = s.indexOf('{');
  return start >= 0 ? s.slice(start) : s;
}

function tryParse(s) { try { return JSON.parse(s); } catch { return undefined; } }

/**
 * Закрывает обрезанный JSON: проходит по строке, запоминает «безопасные точки разреза»
 * (запятые между элементами) и стек скобок; пробует закрыть на конце, затем на точках разреза.
 */
export function repairTruncated(s) {
  const stack = [];
  const cuts = []; // {pos, stack}
  let inStr = false, esc = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{' || ch === '[') stack.push(ch === '{' ? '}' : ']');
    else if (ch === '}' || ch === ']') {
      stack.pop();
      if (!stack.length) { const whole = tryParse(s.slice(0, i + 1)); if (whole !== undefined) return whole; }
    } else if (ch === ',') cuts.push({ pos: i, stack: stack.slice() });
  }
  const close = (st) => st.slice().reverse().join('');
  // 1) закрыть как есть
  let tail = s;
  if (inStr) tail += '"';
  tail = tail.replace(/,\s*$/, '').replace(/,?\s*"[^"]*"\s*:\s*$/, '');
  const direct = tryParse(tail + close(stack));
  if (direct !== undefined) return direct;
  // 2) резать по последним запятым
  for (let k = cuts.length - 1, tries = 0; k >= 0 && tries < 60; k--, tries++) {
    const v = tryParse(s.slice(0, cuts[k].pos) + close(cuts[k].stack));
    if (v !== undefined) return v;
  }
  return undefined;
}

function looseFix(s) {
  return s
    .replace(/[“”]/g, '"')          // «умные» кавычки вокруг ключей
    .replace(/,(\s*,)+/g, ',')                // двойные запятые
    .replace(/,\s*([}\]])/g, '$1')            // хвостовые запятые
    .replace(/([{,]\s*)([A-Za-z_][\w]*)\s*:/g, '$1"$2":'); // ключи без кавычек
}

/** Возвращает { data, repaired } или { data: null, raw } */
export function parseAnalysis(raw) {
  const s = strip(raw);
  let obj = tryParse(s), repaired = false;
  if (obj === undefined) { obj = tryParse(looseFix(s)); repaired = obj !== undefined; }
  if (obj === undefined) { obj = repairTruncated(s); repaired = obj !== undefined; }
  if (obj === undefined) { obj = repairTruncated(looseFix(s)); repaired = obj !== undefined; }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { data: null, raw: String(raw || '') };
  const data = normalize(obj);
  if (!data.summary && !data.nodes.length && !data.steps.length) return { data: null, raw: String(raw || '') };
  return { data, repaired };
}

/* ---------- нормализация ---------- */
const str = (v) => (v === null || v === undefined ? '' : typeof v === 'string' ? v : typeof v === 'object' ? JSON.stringify(v) : String(v)).slice(0, MAX_STR).trim();
const arr = (v) => (Array.isArray(v) ? v : v === undefined || v === null || v === '' ? [] : [v]);
const strArr = (v) => arr(v).map(str).filter(Boolean);
const bool = (v) => v === true || v === 'true';
const slug = (s) => str(s).toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);

export function familyOf(type, family) {
  const f = str(family).toUpperCase();
  if (FAMILIES.includes(f)) return f;
  const m = str(type).toUpperCase().match(/\b(TOP|CHOP|SOP|DAT|COMP|MAT|POP)\b/);
  return m ? (m[1] === 'POP' ? 'SOP' : m[1]) : 'TOP';
}

export function normalize(o) {
  const ids = new Set();
  const nodes = arr(o.nodes).filter((n) => n && typeof n === 'object').map((n, i) => {
    let id = slug(n.id || n.name) || slug(n.type) + (i + 1) || 'node' + (i + 1);
    let base = id, k = 2;
    while (ids.has(id)) id = base + '_' + k++;
    ids.add(id);
    return {
      id,
      type: str(n.type) || id,
      family: familyOf(n.type, n.family),
      params: arr(n.params).map((p) => (p && typeof p === 'object'
        ? { name: str(p.name), value: str(p.value), approximate: bool(p.approximate) }
        : { name: str(p), value: '', approximate: false })).filter((p) => p.name),
      purpose: str(n.purpose),
      _origId: str(n.id),
    };
  });
  // соединения могли ссылаться на исходные id — строим карту
  const idMap = new Map();
  for (const n of nodes) { idMap.set(n.id, n.id); if (n._origId) { idMap.set(n._origId, n.id); idMap.set(slug(n._origId), n.id); } delete n._origId; }
  const seen = new Set();
  const connections = arr(o.connections).filter((c) => c && typeof c === 'object').map((c) => ({
    from: idMap.get(str(c.from)) || idMap.get(slug(c.from)),
    to: idMap.get(str(c.to)) || idMap.get(slug(c.to)),
    inputIndex: Math.max(0, Math.min(15, parseInt(c.inputIndex, 10) || 0)),
    uncertain: bool(c.uncertain),
    kind: str(c.kind) === 'reference' ? 'reference' : 'wire',
  })).filter((c) => {
    if (!c.from || !c.to || c.from === c.to) return false;
    const key = c.from + '>' + c.to + '#' + c.inputIndex;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
  // провод между разными семействами в TouchDesigner невозможен — это ссылка/экспорт
  const famOf = new Map(nodes.map((n) => [n.id, n.family]));
  for (const c of connections) if (c.kind === 'wire' && famOf.get(c.from) !== famOf.get(c.to) && famOf.get(c.to) !== 'COMP') c.kind = 'reference';
  const steps = arr(o.steps).filter((s) => s && typeof s === 'object' || typeof s === 'string').map((s, i) => (typeof s === 'string'
    ? { n: i + 1, title: s.slice(0, 120), nodeIds: [], details: s }
    : {
      n: i + 1,
      title: str(s.title) || str(s.details).slice(0, 80),
      nodeIds: strArr(s.nodeIds).map((x) => idMap.get(x) || idMap.get(slug(x))).filter(Boolean),
      details: str(s.details),
    }));
  const techniques = arr(o.techniques).map((t) => (t && typeof t === 'object' ? { name: str(t.name), why: str(t.why) } : { name: str(t), why: '' })).filter((t) => t.name);
  let confidence = Number(o.confidence);
  if (!isFinite(confidence)) confidence = 0.5;
  if (confidence > 1 && confidence <= 100) confidence /= 100;
  return {
    summary: str(o.summary),
    observations: strArr(o.observations),
    isLikelyTouchDesigner: o.isLikelyTouchDesigner === undefined ? true : bool(o.isLikelyTouchDesigner),
    techniques, nodes, connections, steps,
    animation: strArr(o.animation),
    postfx: strArr(o.postfx),
    tweakNotes: strArr(o.tweakNotes),
    uncertainties: strArr(o.uncertainties),
    tutorialQueries: strArr(o.tutorialQueries).map((q) => q.slice(0, 100)).slice(0, 4),
    confidence: Math.max(0, Math.min(1, confidence)),
  };
}
