// Временная заглушка (этап 3): полноценный рендер — этап 4.
import { h } from '../core/dom.js';
import { renderMd } from './markdown.js';

export function renderResult(root, record) {
  root.replaceChildren();
  const card = h('div.card.glass.glass--dense');
  if (record.result) card.append(h('h2', { text: 'summary' }), h('p', { text: record.result.summary }), h('pre', { text: JSON.stringify(record.result, null, 2) }));
  else card.append(renderMd(h('div'), record.raw));
  root.append(card);
}
