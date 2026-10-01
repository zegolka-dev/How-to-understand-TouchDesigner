// Вкладка «Разбор»: видео → кадры и метрики → запрос к модели → результат.
import { $, h, icon } from '../core/dom.js';
import { ls, bus } from '../core/store.js';
import { t, fmtBytes, fmtNum } from '../core/i18n.js';
import { AppError } from '../core/errors.js';
import { segmented, setStatus, errorText } from './ui.js';
import { loadVideo, extractFrames, makeThumbs } from '../video/extract.js';
import { computeMetrics } from '../video/metrics.js';
import { checkFile, checkDuration, estimateRequestBytes, estimateFromAvg, FRAMES, WARN_REQUEST } from '../video/limits.js';
import { getActiveId, setActiveId, getFallbackId, getProvider, getModel, setModel, getAltModel, hasKey, getCachedModels, refreshModels } from '../providers/registry.js';
import { analyze } from '../ai/service.js';
import { renderResult } from '../render/result.js';
import { renderChat } from './chat.js';
import { buildContextTurn } from '../ai/prompt.js';
import { openOnboarding } from './onboarding.js';

const S = {
  file: null, meta: null, frames: [], urls: [], times: [], smalls: [], metrics: null,
  extracting: false, busy: false, abort: null, extractAbort: null,
  session: null, // { record, history }
};

const el = {};

export function getSession() { return S.session; }

export function initAnalyze() {
  for (const id of ['drop', 'file', 'video-box', 'vid', 'file-name', 'change-video', 'metrics', 'frames', 'video-status', 'nframes', 'nframes-val', 'req-size', 'level-hint', 'note', 'provider-line', 'go', 'cancel', 'run-status', 'run-actions', 'result']) {
    el[id] = document.getElementById(id);
  }

  // уровень объяснения
  const level = ['beginner', 'mid', 'pro'].includes(ls.get('level')) ? ls.get('level') : 'mid';
  const levelSeg = segmented($('[data-seg="level"]'), { value: level, onChange: (v) => { ls.set('level', v); updateLevelHint(); } });
  bus.on('lang', () => { levelSeg.place(); updateLevelHint(); updateProviderLine(); updateSize(); renderMetrics(); if (S.session) showRecord(S.session.record); });

  // число кадров
  const n = Math.min(FRAMES.max, Math.max(FRAMES.min, parseInt(ls.get('frames'), 10) || FRAMES.def));
  el.nframes.value = n;
  syncSlider();
  el.nframes.addEventListener('input', () => { syncSlider(); updateSize(); });
  el.nframes.addEventListener('change', () => { ls.set('frames', el.nframes.value); if (S.meta) extract(); });
  el.note.addEventListener('input', updateSize);

  // загрузка файла
  el.drop.addEventListener('click', () => el.file.click());
  el['change-video'].addEventListener('click', () => el.file.click());
  el.file.addEventListener('change', () => { if (el.file.files[0]) loadFile(el.file.files[0]); el.file.value = ''; });
  const zone = $('#video-card');
  let depth = 0;
  zone.addEventListener('dragenter', (e) => { e.preventDefault(); depth++; el.drop.classList.add('is-over'); });
  zone.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
  zone.addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; el.drop.classList.remove('is-over'); } });
  zone.addEventListener('drop', (e) => {
    e.preventDefault(); depth = 0; el.drop.classList.remove('is-over');
    const f = e.dataTransfer.files?.[0]; if (f) loadFile(f);
  });
  // не открывать файл в браузере при промахе мимо зоны
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => e.preventDefault());

  el.go.addEventListener('click', () => run());
  el.cancel.addEventListener('click', () => S.abort?.abort());

  const quickSeg = segmented($('[data-seg="quick-provider"]'), { value: getActiveId(), onChange: (v) => setActiveId(v) });
  $('#quick-model').addEventListener('change', (e) => setModel(getActiveId(), e.target.value));
  bus.on('provider', ({ active }) => { quickSeg.set(active); fillQuickModel(); updateProviderLine(); });
  bus.on('model', () => { fillQuickModel(); updateProviderLine(); });
  bus.on('models', () => { fillQuickModel(); });
  bus.on('lang', () => { quickSeg.place(); fillQuickModel(); });
  fillQuickModel();
  bus.on('keys', () => { updateProviderLine(); updateGo(); });
  updateLevelHint(); updateProviderLine(); updateSize(); updateGo();
}

const currentLevel = () => $('[data-seg="level"] [aria-checked="true"]')?.dataset.value || 'mid';

function syncSlider() {
  el['nframes-val'].textContent = el.nframes.value;
  const p = ((el.nframes.value - FRAMES.min) / (FRAMES.max - FRAMES.min)) * 100;
  el.nframes.style.setProperty('--fill', p + '%');
}

function updateLevelHint() { el['level-hint'].textContent = t('level.hint.' + currentLevel()); }

let loadingModels = false;
function fillQuickModel() {
  const id = getActiveId();
  const sel = $('#quick-model');
  const models = getCachedModels(id);
  const cur = getModel(id);
  sel.replaceChildren();
  if (!models.length) {
    sel.append(h('option', { value: '', text: hasKey(id) ? t('settings.loadingModels') : t('settings.noModels') }));
    sel.disabled = true;
    if (hasKey(id) && !loadingModels) {
      loadingModels = true;
      refreshModels(id).catch(() => {}).finally(() => { loadingModels = false; if (getCachedModels(id).length) fillQuickModel(); });
    }
    return;
  }
  sel.disabled = false;
  for (const m of models) sel.append(h('option', { value: m.id, text: m.id }));
  sel.value = models.some((m) => m.id === cur) ? cur : models[0].id;
}

function updateProviderLine() {
  const id = getActiveId();
  const p = getProvider(id);
  const model = getModel(id);
  // бесплатные модели OpenRouter и flash-lite заметно хуже разбирают видео — предупреждаем
  const weak = id === 'openrouter' ? t('analyze.weakOpenRouter') : /lite/.test(model) ? t('analyze.weakLite') : '';
  el['provider-line'].replaceChildren(
    icon(hasKey(id) && !weak ? 'key' : 'alert', 'icon--sm'),
    h('span', { text: !hasKey(id) ? t('analyze.noKeyLine', { provider: p.name }) : weak || t('analyze.via', { provider: p.name, model: model || t('analyze.modelAuto') }) }),
  );
  el['provider-line'].classList.add('row');
  el['provider-line'].classList.toggle('status--warn', !!weak || !hasKey(id));
}

function updateSize() {
  const n = +el.nframes.value;
  if (!S.frames.length) { el['req-size'].textContent = t('analyze.sizeHint', { n }); return; }
  const avg = estimateRequestBytes(S.frames) / S.frames.length;
  const bytes = S.frames.length === n ? estimateRequestBytes(S.frames, 6000 + el.note.value.length) : estimateFromAvg(avg, n);
  el['req-size'].textContent = t('analyze.size', { size: fmtBytes(bytes) }) + (bytes > WARN_REQUEST ? ' ' + t('analyze.sizeWarn') : '');
  el['req-size'].classList.toggle('status--warn', bytes > WARN_REQUEST);
}

function updateGo() {
  el.go.disabled = S.busy || S.extracting || !S.frames.length;
}

/* ---------- видео ---------- */
async function loadFile(file) {
  if (S.busy) return;
  try { checkFile(file); } catch (e) { setStatus(el['video-status'], 'err', errorText(e)); return; }
  S.extractAbort?.abort();
  Object.assign(S, { file, meta: null, frames: [], urls: [], times: [], smalls: [], metrics: null });
  el['frames'].replaceChildren(); el['metrics'].replaceChildren();
  el['video-box'].hidden = false; el.drop.hidden = true;
  el['file-name'].textContent = file.name;
  setStatus(el['video-status'], 'busy', t('analyze.reading'));
  updateGo(); updateSize();
  try {
    S.meta = await loadVideo(file, el.vid);
    checkDuration(S.meta.duration);
  } catch (e) {
    S.meta = null;
    setStatus(el['video-status'], 'err', errorText(e));
    el['video-box'].hidden = true; el.drop.hidden = false;
    return;
  }
  await extract();
}

async function extract() {
  if (!S.meta) return;
  S.extractAbort?.abort();
  const ctrl = new AbortController(); S.extractAbort = ctrl;
  S.extracting = true; updateGo();
  const count = +el.nframes.value;
  el['frames'].replaceChildren();
  try {
    const r = await extractFrames(el.vid, {
      count, signal: ctrl.signal,
      onProgress: (i, n) => setStatus(el['video-status'], 'busy', t('analyze.grabbing', { i, n })),
    });
    if (ctrl.signal.aborted) return;
    Object.assign(S, { frames: r.frames, urls: r.urls, times: r.times, smalls: r.smalls });
    S.metrics = computeMetrics(r.smalls, S.meta);
    el['frames'].replaceChildren(...r.urls.map((u, i) => h('img', { src: u, alt: t('analyze.frameAlt', { i: i + 1, t: fmtNum(r.times[i], { maximumFractionDigits: 1 }) }), role: 'listitem', loading: 'lazy' })));
    renderMetrics();
    setStatus(el['video-status'], 'ok', t('analyze.framesReady'));
    el.vid.currentTime = 0;
  } catch (e) {
    if (e.code !== 'aborted') setStatus(el['video-status'], 'err', errorText(e));
  } finally {
    if (S.extractAbort === ctrl) { S.extracting = false; updateGo(); updateSize(); }
  }
}

function renderMetrics() {
  const m = S.metrics;
  if (!m) return;
  const chip = (...c) => h('span.chip', { role: 'listitem' }, ...c);
  el.metrics.replaceChildren(
    chip(`${m.w}×${m.h}`),
    chip(t('analyze.seconds', { s: fmtNum(m.duration, { maximumFractionDigits: 1 }) })),
    chip(t('analyze.motion') + ': ' + t('motion.' + m.motionLevel)),
    chip(t(m.looped ? 'analyze.looped' : 'analyze.notLooped')),
    chip(t('analyze.brightness', { p: Math.round(m.brightness * 100) })),
    chip(...m.palette.map((c) => h('span.swatch', { style: { background: c }, title: c })), h('span', { text: t('analyze.palette') })),
  );
}

/* ---------- запрос ---------- */
async function run(providerId = getActiveId()) {
  if (S.busy || !S.frames.length) return;
  el['run-actions'].replaceChildren();
  if (!hasKey(providerId)) {
    setStatus(el['run-status'], 'err', t('err.noKey'));
    el['run-actions'].append(h('button.btn.btn--secondary.btn--sm', { type: 'button', on: { click: () => openOnboarding() } }, icon('sparkles', 'icon--sm'), h('span', { text: t('settings.openOnboarding') })));
    return;
  }
  S.busy = true; updateGo();
  S.abort = new AbortController();
  el.cancel.hidden = false;
  const started = Date.now();
  let note2 = '';
  const tick = () => setStatus(el['run-status'], 'busy', note2 + t('analyze.thinking', { s: Math.round((Date.now() - started) / 1000) }));
  tick();
  const timer = setInterval(tick, 1000);
  const lang = document.documentElement.lang === 'ru' ? 'ru' : 'en';
  const level = currentLevel();
  const note = el.note.value.trim();
  try {
    const res = await analyze({ providerId, frames: S.frames, times: S.times, metrics: S.metrics, lang, level, note, signal: S.abort.signal,
      onModel: (m) => { note2 = t('analyze.switchingModel', { model: m }) + ' '; tick(); updateProviderLine(); } });
    const thumbs = await makeThumbs(S.urls, 4).catch(() => []);
    const record = {
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2),
      v: 1, createdAt: Date.now(), fileName: S.file?.name || '', provider: res.provider, model: res.model,
      lang, level, note, metrics: S.metrics, thumbs,
      result: res.data, raw: res.data ? null : res.raw, repaired: res.repaired,
      chat: [], doneSteps: [],
    };
    S.session = { record, history: [res.firstTurn, { role: 'model', parts: [{ text: res.raw }] }], live: true };
    setStatus(el['run-status'], res.data ? 'ok' : 'warn', t(res.data ? (res.repaired ? 'analyze.doneRepaired' : 'analyze.done') : 'analyze.doneRaw'));
    showRecord(record, { scroll: true });
    bus.emit('analysis', record);
  } catch (e) {
    handleError(e, providerId);
  } finally {
    clearInterval(timer);
    S.busy = false; S.abort = null; el.cancel.hidden = true; updateGo();
  }
}

function handleError(e, providerId) {
  const err = e instanceof AppError ? e : new AppError('network', { detail: e?.message });
  setStatus(el['run-status'], err.code === 'aborted' ? '' : 'err', (err.triedModels?.length > 1 ? t('analyze.triedModels', { models: err.triedModels.join(', ') }) + ' ' : '') + errorText(err));
  const actions = [];
  if (['server', 'quota', 'notFoundModel', 'empty', 'timeout'].includes(err.code)) {
    const alt = getAltModel(providerId, err.triedModels || []);
    if (alt) actions.push(h('button.btn.btn--primary.btn--sm', { type: 'button', on: { click: () => { setModel(providerId, alt); run(providerId); } } },
      icon('refresh', 'icon--sm'), h('span', { text: t('analyze.tryModel', { model: alt }) })));
  }
  if (err.quota || err.code === 'region' || err.code === 'server') {
    const fb = getFallbackId(providerId);
    if (fb) {
      actions.push(h('button.btn.btn--secondary.btn--sm', { type: 'button', on: { click: () => { setActiveId(fb); run(fb); } } },
        icon('refresh', 'icon--sm'), h('span', { text: t('analyze.switchRetry', { provider: getProvider(fb).name }) })));
    } else {
      actions.push(h('button.btn.btn--secondary.btn--sm', { type: 'button', on: { click: () => openOnboarding() } }, icon('key', 'icon--sm'), h('span', { text: t('analyze.setupBackup') })));
    }
  }
  if (['badKey', 'forbidden', 'noKey', 'notFoundModel', 'noModels'].includes(err.code)) {
    actions.push(h('a.btn.btn--secondary.btn--sm', { href: '#settings' }, icon('settings', 'icon--sm'), h('span', { text: t('nav.settings') })));
  }
  if (err.retryable && err.code !== 'aborted') {
    actions.push(h('button.btn.btn--ghost.btn--sm', { type: 'button', on: { click: () => run(providerId) } }, icon('refresh', 'icon--sm'), h('span', { text: t('common.retry') })));
  }
  el['run-actions'].replaceChildren(...actions);
}

/** Показ записи (новой или из истории). */
export function showRecord(record, { scroll = false } = {}) {
  el.result.hidden = false;
  const { chatSlot } = renderResult(el.result, record);
  if (S.session?.record === record) renderChat(chatSlot, S.session);
  if (scroll) el.result.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
}

/** Открыть запись из истории: кадров нет, контекст для вопросов — текст разбора. */
export function openRecord(record) {
  const context = buildContextTurn({ metrics: record.metrics, result: record.result, raw: record.raw, note: record.note });
  S.session = { record, history: [context, { role: 'model', parts: [{ text: 'OK' }] }], live: false };
  showRecord(record, { scroll: true });
}
