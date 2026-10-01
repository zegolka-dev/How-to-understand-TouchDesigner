// Вкладка «История»: список разборов, открытие, удаление, экспорт/импорт JSON.
import { $, h, icon } from '../core/dom.js';
import { bus } from '../core/store.js';
import { t, fmtDate } from '../core/i18n.js';
import { toast, confirmSheet } from './ui.js';
import { listRecords, putRecord, removeRecord, clearAll, exportAll, importFile } from '../history/db.js';
import { download } from '../render/export.js';

let listEl, countEl, onOpen;

export function initHistory({ open }) {
  onOpen = open;
  const view = $('#view-history');
  const fileIn = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
  countEl = h('span.chip');
  const toolbar = h('div.toolbar.card.glass.glass--dense.history__bar', {},
    countEl, h('span.spacer'),
    h('button.btn.btn--secondary.btn--sm', { type: 'button', on: { click: doExport } }, icon('download', 'icon--sm'), h('span', { text: t('history.export') })),
    h('button.btn.btn--secondary.btn--sm', { type: 'button', on: { click: () => fileIn.click() } }, icon('upload', 'icon--sm'), h('span', { text: t('history.import') })),
    h('button.btn.btn--ghost.btn--sm.btn--danger', { type: 'button', on: { click: doClear } }, icon('trash', 'icon--sm'), h('span', { text: t('history.clear') })),
    fileIn);
  listEl = h('div.history__list', { role: 'list' });
  view.append(toolbar, listEl);

  fileIn.addEventListener('change', async () => {
    const f = fileIn.files[0]; fileIn.value = '';
    if (!f) return;
    try { const n = await importFile(f); toast(t('history.imported', { n }), { type: 'ok' }); refresh(); }
    catch (e) { toast(t(e.message === 'tooBig' ? 'history.importTooBig' : 'history.importBad'), { type: 'err' }); }
  });

  // автосохранение
  bus.on('analysis', (rec) => putRecord(rec).then(refresh).catch(() => toast(t('history.saveFail'), { type: 'err' })));
  // очередь, чтобы записи шли по порядку и не терялись при быстром закрытии вкладки
  let chain = Promise.resolve();
  bus.on('record-changed', (rec) => { chain = chain.then(() => putRecord(rec)).then(refresh).catch(() => {}); });
  bus.on('lang', () => { rebuildToolbar(toolbar); refresh(); });
  refresh();
}

function rebuildToolbar(toolbar) {
  const labels = ['history.export', 'history.import', 'history.clear'];
  toolbar.querySelectorAll('button span').forEach((s, i) => { s.textContent = t(labels[i]); });
}

async function refresh() {
  let items = [];
  try { items = await listRecords(); } catch { listEl.replaceChildren(h('p.status.status--err', { text: t('history.dbFail') })); return; }
  countEl.textContent = t('history.count', { n: items.length });
  if (!items.length) {
    listEl.replaceChildren(h('div.card.glass.glass--dense.history__empty', {}, icon('history', 'icon--lg'), h('p', { text: t('history.empty') })));
    return;
  }
  listEl.replaceChildren(...items.map(card));
}

function card(rec) {
  const title = rec.fileName || t('history.untitled');
  const summary = rec.result?.summary || (rec.raw ? rec.raw.slice(0, 200) : '');
  return h('article.card.glass.glass--dense.hcard', { role: 'listitem' },
    rec.thumbs.length ? h('div.hcard__thumbs', { 'aria-hidden': 'true' }, rec.thumbs.map((src) => h('img', { src, alt: '' }))) : null,
    h('div.hcard__body', {},
      h('h2.hcard__title', { text: title }),
      h('p.hcard__meta', { text: [fmtDate(rec.createdAt), rec.model].filter(Boolean).join(' · ') }),
      summary ? h('p.hcard__summary', { text: summary }) : null,
      h('div.row', {},
        h('button.btn.btn--primary.btn--sm', { type: 'button', on: { click: () => onOpen(rec) } }, h('span', { text: t('history.open') })),
        h('button.btn.btn--ghost.btn--sm.btn--danger', { type: 'button', 'aria-label': t('history.deleteOne', { name: title }), on: { click: () => doDelete(rec, title) } }, icon('trash', 'icon--sm'), h('span', { text: t('history.delete') })))));
}

async function doDelete(rec, title) {
  if (!(await confirmSheet({ title: t('history.deleteTitle'), text: t('history.deleteText', { name: title }), okLabel: t('history.delete'), danger: true }))) return;
  await removeRecord(rec.id);
  refresh();
}

async function doClear() {
  const items = await listRecords();
  if (!items.length) return;
  if (!(await confirmSheet({ title: t('history.clearTitle'), text: t('history.clearText', { n: items.length }), okLabel: t('history.clear'), danger: true }))) return;
  await clearAll();
  refresh();
  toast(t('history.cleared'), { type: 'ok' });
}

async function doExport() {
  const data = await exportAll();
  if (!data.items.length) { toast(t('history.empty')); return; }
  const d = new Date().toISOString().slice(0, 10);
  download(new Blob([JSON.stringify(data)], { type: 'application/json' }), `td-explainer-history-${d}.json`);
}
