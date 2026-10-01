// Рендер результата из JSON. Всё содержимое от модели вставляется как текст (или через экранирующий md/inline).
import { h, icon } from '../core/dom.js';
import { bus } from '../core/store.js';
import { t, fmtDate } from '../core/i18n.js';
import { renderMd, renderInline } from './markdown.js';
import { renderGraph, serializeSvg, svgToPngBlob } from './graph.js';
import { toMarkdown, copyText, download, printPdf, baseName } from './export.js';
import { toast } from '../views/ui.js';

const FAM_KEYS = ['TOP', 'CHOP', 'SOP', 'DAT', 'COMP', 'MAT'];

function section(cls, iconId, titleKey, ...body) {
  return h('section.card.glass.glass--dense.res-card', { class: cls, 'aria-labelledby': 'h-' + cls },
    h('h2.card__title', { id: 'h-' + cls }, icon(iconId), h('span', { text: t(titleKey) })), ...body);
}

const inlineEl = (tag, text) => renderInline(h(tag), text);

function list(items, empty = true) {
  if (!items.length) return empty ? h('p.muted', { text: t('result.empty') }) : null;
  return h('ul.res-list', {}, items.map((x) => inlineEl('li', x)));
}

function paramsTable(node) {
  if (!node.params.length) return null;
  return h('dl.params', {}, node.params.map((p) => [
    h('dt', { text: p.name }),
    h('dd', {}, h('code', { text: p.value || '—' }),
      p.approximate ? h('span.approx', { title: t('result.approx'), 'aria-label': t('result.approx'), role: 'img', text: '≈' }) : null),
  ]));
}

function nodeChip(node, onClick) {
  return h('button.node-chip', { type: 'button', 'data-fam': node.family, 'aria-label': t('result.showNode', { id: node.id }), on: { click: () => onClick(node.id) } },
    h('span.node-chip__dot', { 'aria-hidden': 'true' }), h('span', { text: node.id }), h('span.node-chip__type', { text: node.type }));
}

/**
 * root — контейнер; record — запись (см. PLAN 3.2).
 * Возвращает { chatSlot } — место для чата (этап 5).
 */
export function renderResult(root, record) {
  root.replaceChildren();
  const r = record.result;
  const meta = h('p.res-meta', { text: [record.fileName, record.model, fmtDate(record.createdAt)].filter(Boolean).join(' · ') });

  /* шапка и экспорт */
  const md = () => toMarkdown(record);
  const toolbar = h('div.toolbar', { role: 'toolbar', 'aria-label': t('result.export') },
    h('button.btn.btn--secondary.btn--sm', { type: 'button', on: { click: async () => toast(t(await copyText(md()) ? 'common.copied' : 'result.copyFail'), { type: 'ok', timeout: 2500 }) } }, icon('copy', 'icon--sm'), h('span', { text: t('result.copy') })),
    h('button.btn.btn--secondary.btn--sm', { type: 'button', on: { click: () => download(new Blob([md()], { type: 'text/markdown;charset=utf-8' }), baseName(record) + '.md') } }, icon('doc', 'icon--sm'), h('span', { text: 'Markdown' })),
    h('button.btn.btn--secondary.btn--sm', { type: 'button', on: { click: printPdf } }, icon('print', 'icon--sm'), h('span', { text: 'PDF' })),
  );
  const head = h('div.card.glass.glass--dense.res-head.res-card', {},
    h('div.res-head__top', {}, h('h2.res-title', { text: t('result.title') }), toolbar), meta);
  root.append(head);

  if (!r) {
    head.append(h('p.status.status--warn', {}, icon('alert', 'icon--sm'), h('span', { text: t('result.rawNote') })));
    root.append(section('res-raw', 'doc', 'result.rawTitle', renderMd(h('div'), record.raw || '')));
    return finish(root);
  }

  const conf = Math.round(r.confidence * 100);
  head.append(h('div.chips', {},
    h('span.chip.chip--accent', { text: t('result.confidence') + ': ' + conf + '%' }),
    record.repaired ? h('span.chip', { text: t('result.repaired') }) : null));
  if (!r.isLikelyTouchDesigner) head.append(h('p.status.status--warn', {}, icon('alert', 'icon--sm'), h('span', { text: t('result.notTd') })));

  /* 1. Что на видео */
  root.append(section('res-summary', 'film', 'result.summary', inlineEl('p.res-summary', r.summary || '—')));

  /* 2. Приёмы */
  root.append(section('res-tech', 'sparkles', 'result.techniques',
    r.techniques.length ? h('ul.res-list', {}, r.techniques.map((x) => h('li', {}, h('b', { text: x.name }), x.why ? inlineEl('span', ' — ' + x.why) : null))) : h('p.muted', { text: t('result.empty') })));

  /* 3. Схема нод */
  const nodeById = new Map(r.nodes.map((n) => [n.id, n]));
  let graph = null;
  const stepEls = new Map();
  const graphWrap = h('div.graph-wrap', { tabindex: '-1' });
  const selectNode = (id) => {
    graph?.highlight(new Set([id]));
    let first = null;
    for (const [n, li] of stepEls) {
      const on = r.steps.find((s) => s.n === n)?.nodeIds.includes(id);
      li.classList.toggle('is-linked', !!on);
      if (on && !first) first = li;
    }
    first?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };
  const selectStep = (step) => {
    graph?.highlight(new Set(step.nodeIds));
    for (const [n, li] of stepEls) li.classList.toggle('is-linked', n === step.n);
    graphWrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  const graphTools = h('div.toolbar');
  if (r.nodes.length) {
    graph = renderGraph(r, {
      label: t('result.graphLabel', { n: r.nodes.length }),
      nodeLabel: (n) => `${n.type} ${n.id}`,
      onSelect: selectNode,
    });
    graphWrap.append(graph.svg);
    const bg = () => getComputedStyle(document.documentElement).getPropertyValue('--graph-export-bg').trim() || '#ffffff';
    graphTools.append(
      h('button.btn.btn--secondary.btn--sm', { type: 'button', on: { click: () => download(new Blob([serializeSvg(graph.svg, bg())], { type: 'image/svg+xml' }), baseName(record) + '.svg') } }, icon('download', 'icon--sm'), h('span', { text: 'SVG' })),
      h('button.btn.btn--secondary.btn--sm', { type: 'button', on: { click: async () => {
        try { const L = graph.layout; download(await svgToPngBlob(serializeSvg(graph.svg, bg()), L.width, L.height, 2), baseName(record) + '.png'); }
        catch { toast(t('result.pngFail'), { type: 'err' }); }
      } } }, icon('image', 'icon--sm'), h('span', { text: 'PNG' })),
      h('button.btn.btn--ghost.btn--sm', { type: 'button', on: { click: () => { graph.highlight(null); stepEls.forEach((li) => li.classList.remove('is-linked')); } } }, h('span', { text: t('result.clearSel') })),
    );
  }
  const legend = h('ul.legend', { 'aria-label': t('result.legend') },
    FAM_KEYS.filter((f) => r.nodes.some((n) => n.family === f)).map((f) => h('li', { 'data-fam': f }, h('span.legend__dot', { 'aria-hidden': 'true' }), h('span', { text: f }))),
    r.connections.some((c) => c.uncertain) ? h('li.legend__dash', {}, h('span.legend__line', { 'aria-hidden': 'true' }), h('span', { text: t('result.uncertainLink') })) : null);
  const unlinked = r.nodes.filter((n) => !r.steps.some((s) => s.nodeIds.includes(n.id)));
  root.append(section('res-graph', 'graph', 'result.graph',
    r.nodes.length ? [h('p.hint', { text: t('result.graphHint') }), graphWrap, legend, graphTools] : h('p.muted', { text: t('result.empty') }),
    unlinked.length ? h('details.res-details', {}, h('summary', { text: t('result.otherNodes') }),
      h('div.stack', {}, unlinked.map((n) => h('div.node-block', {}, nodeChip(n, selectNode), n.purpose ? inlineEl('p.small.muted', n.purpose) : null, paramsTable(n))))) : null));

  /* 4. Пошаговая инструкция */
  const done = new Set(record.doneSteps || []);
  const progress = h('span.chip', { 'aria-live': 'polite' });
  const updateProgress = () => { progress.textContent = t('result.progress', { d: done.size, n: r.steps.length }); };
  updateProgress();
  const stepsList = h('ol.steps', {}, r.steps.map((s) => {
    const cbId = 'step-' + record.id + '-' + s.n;
    const cb = h('input.switch', { type: 'checkbox', id: cbId, checked: done.has(s.n) ? true : null });
    const nodesHere = s.nodeIds.map((id) => nodeById.get(id)).filter(Boolean);
    const li = h('li.step', { class: done.has(s.n) ? 'is-done' : '' },
      h('div.step__head', {},
        h('span.step__n', { 'aria-hidden': 'true', text: String(s.n) }),
        h('button.step__title', { type: 'button', on: { click: () => selectStep(s) }, title: t('result.showStepHint') }, h('span', { text: s.title })),
        h('label.switch-wrap', { for: cbId, title: t('result.doneStep', { n: s.n }) }, cb, h('span.sr-only', { text: t('result.doneStep', { n: s.n }) }))),
      s.details ? renderMd(h('div.step__details'), s.details) : null,
      nodesHere.length ? h('div.step__nodes', {}, nodesHere.map((n) => h('div.node-block', {}, nodeChip(n, selectNode), paramsTable(n)))) : null);
    cb.addEventListener('change', () => {
      if (cb.checked) done.add(s.n); else done.delete(s.n);
      record.doneSteps = [...done].sort((a, b) => a - b);
      li.classList.toggle('is-done', cb.checked);
      updateProgress();
      bus.emit('record-changed', record);
    });
    stepEls.set(s.n, li);
    return li;
  }));
  root.append(section('res-steps', 'check', 'result.steps', h('div.row', {}, progress), r.steps.length ? stepsList : h('p.muted', { text: t('result.empty') })));

  /* 5–7 */
  root.append(section('res-anim', 'refresh', 'result.animation', list(r.animation)));
  root.append(section('res-post', 'sparkles', 'result.postfx', list(r.postfx)));
  root.append(section('res-tweak', 'settings', 'result.tweak', list(r.tweakNotes),
    r.uncertainties.length ? [h('h3.res-sub', { text: t('result.uncertain') }), list(r.uncertainties, false)] : null,
    h('p.hint', {}, h('span.approx', { 'aria-hidden': 'true', text: '≈' }), ' ' + t('result.approx'))));

  return finish(root);
}

function finish(root) {
  [...root.children].forEach((c, i) => c.style.setProperty('--i', String(i)));
  const chatSlot = h('div.result__chat');
  root.append(chatSlot);
  return { chatSlot };
}
