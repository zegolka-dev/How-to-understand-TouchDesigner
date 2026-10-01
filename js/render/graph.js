// SVG-схема нод: раскладка по слоям слева направо (топологическая сортировка), feedback-рёбра — отдельной дугой.
import { svgEl } from '../core/dom.js';

export const NODE_W = 176, NODE_H = 64, HEAD_H = 20, GAP_X = 72, GAP_Y = 28, PAD = 28;

/** Чистая раскладка (без DOM) — удобно тестировать. */
export function layoutGraph(nodes, connections) {
  const ids = nodes.map((n) => n.id);
  const out = new Map(ids.map((id) => [id, []]));
  const edges = connections.filter((c) => out.has(c.from) && out.has(c.to) && c.from !== c.to).map((c, i) => ({ ...c, i, back: false }));
  for (const e of edges) out.get(e.from).push(e);

  // 1. обратные рёбра (циклы) через DFS
  const state = new Map(); // 0/undef — не посещён, 1 — в стеке, 2 — готов
  const visit = (id) => {
    state.set(id, 1);
    for (const e of out.get(id)) {
      const s = state.get(e.to);
      if (s === 1) e.back = true;
      else if (!s) visit(e.to);
    }
    state.set(id, 2);
  };
  // начинаем с источников, чтобы «обратными» стали именно рёбра обратной связи
  const indeg0 = new Map(ids.map((id) => [id, 0]));
  for (const e of edges) indeg0.set(e.to, indeg0.get(e.to) + 1);
  for (const id of ids) if (!indeg0.get(id) && !state.get(id)) visit(id);
  for (const id of ids) if (!state.get(id)) visit(id);

  // 2. слои: длиннейший путь от источников (Kahn по DAG)
  const fwd = edges.filter((e) => !e.back);
  const indeg = new Map(ids.map((id) => [id, 0]));
  for (const e of fwd) indeg.set(e.to, indeg.get(e.to) + 1);
  const layer = new Map(ids.map((id) => [id, 0]));
  const queue = ids.filter((id) => !indeg.get(id));
  while (queue.length) {
    const id = queue.shift();
    for (const e of fwd) if (e.from === id) {
      layer.set(e.to, Math.max(layer.get(e.to), layer.get(id) + 1));
      indeg.set(e.to, indeg.get(e.to) - 1);
      if (!indeg.get(e.to)) queue.push(e.to);
    }
  }
  // источники без исходящих рёбер подтягиваем ближе к потребителю (CHOP-драйверы)
  for (const id of ids) {
    const outs = fwd.filter((e) => e.from === id);
    const ins = fwd.filter((e) => e.to === id);
    if (!ins.length && outs.length) layer.set(id, Math.max(0, Math.min(...outs.map((e) => layer.get(e.to))) - 1));
  }

  const nLayers = Math.max(0, ...layer.values()) + 1;
  const layers = Array.from({ length: nLayers }, () => []);
  for (const id of ids) layers[layer.get(id)].push(id);

  // 3. порядок внутри слоя: барицентры (несколько проходов вниз/вверх)
  const pos = new Map();
  const reindex = () => layers.forEach((L) => L.forEach((id, k) => pos.set(id, k)));
  reindex();
  const bary = (id, dir) => {
    const nb = fwd.filter((e) => (dir > 0 ? e.to === id : e.from === id)).map((e) => pos.get(dir > 0 ? e.from : e.to));
    return nb.length ? nb.reduce((a, b) => a + b, 0) / nb.length : pos.get(id);
  };
  for (let pass = 0; pass < 4; pass++) {
    const dir = pass % 2 ? -1 : 1;
    const order = dir > 0 ? layers.slice(1) : layers.slice(0, -1).reverse();
    for (const L of order) { const b = new Map(L.map((id) => [id, bary(id, dir)])); L.sort((a, c) => b.get(a) - b.get(c)); }
    reindex();
  }

  // 4. координаты
  const maxCount = Math.max(1, ...layers.map((L) => L.length));
  const coords = new Map();
  layers.forEach((L, li) => {
    const off = ((maxCount - L.length) * (NODE_H + GAP_Y)) / 2;
    L.forEach((id, k) => coords.set(id, { x: PAD + li * (NODE_W + GAP_X), y: PAD + off + k * (NODE_H + GAP_Y) }));
  });
  const hasBack = edges.some((e) => e.back);
  const width = PAD * 2 + nLayers * NODE_W + (nLayers - 1) * GAP_X;
  const height = PAD * 2 + maxCount * NODE_H + (maxCount - 1) * GAP_Y + (hasBack ? 48 : 0);

  // порты входов: по максимальному inputIndex входящих рёбер
  const inPorts = new Map(ids.map((id) => [id, 1]));
  for (const e of edges) if (e.kind !== 'reference') inPorts.set(e.to, Math.max(inPorts.get(e.to), e.inputIndex + 1));

  return { coords, edges, width, height, layers, inPorts, bottom: PAD + maxCount * NODE_H + (maxCount - 1) * GAP_Y };
}

const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

/**
 * Рисует SVG. opts: { label, nodeLabel(node) -> aria-label, onSelect(id) }
 * Возвращает { svg, highlight(Set<id>|null) }.
 */
export function renderGraph(data, opts = {}) {
  const { nodes, connections } = data;
  const L = layoutGraph(nodes, connections);
  const svg = svgEl('svg', { class: 'graph', viewBox: `0 0 ${L.width} ${L.height}`, width: L.width, height: L.height, role: 'group', 'aria-label': opts.label || '', xmlns: 'http://www.w3.org/2000/svg' });
  const defs = svgEl('defs');
  const marker = svgEl('marker', { id: 'g-arrow', viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse' });
  marker.append(svgEl('path', { d: 'M0 0 L10 5 L0 10 z', class: 'g-arrow' }));
  const marker2 = svgEl('marker', { id: 'g-arrow-ref', viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse' });
  marker2.append(svgEl('path', { d: 'M0 0 L10 5 L0 10 z', class: 'g-arrow-ref' }));
  defs.append(marker, marker2);
  svg.append(defs);

  const edgeLayer = svgEl('g', { class: 'g-edges' });
  const nodeLayer = svgEl('g', { class: 'g-nodes' });
  svg.append(edgeLayer, nodeLayer);

  const edgeEls = [];
  const portY = (id, k) => HEAD_H + ((NODE_H - HEAD_H) * (k + 1)) / (L.inPorts.get(id) + 1);
  for (const e of L.edges) {
    const a = L.coords.get(e.from), b = L.coords.get(e.to);
    const ref = e.kind === 'reference';
    let d;
    if (e.back) {
      // обратная связь (feedback) — дуга под схемой
      const y = L.bottom + 30;
      const x1 = a.x + NODE_W / 2, x2 = b.x + NODE_W / 2;
      d = `M${x1} ${a.y + NODE_H} C${x1} ${y}, ${x2} ${y}, ${x2} ${b.y + NODE_H}`;
    } else if (ref) {
      // ссылка/экспорт: входит в ноду сверху, не в порт — в TouchDesigner это не провод
      const x1 = a.x + NODE_W, y1 = a.y + NODE_H / 2;
      const x2 = b.x + NODE_W / 2, y2 = b.y;
      d = `M${x1} ${y1} C${x1 + 40} ${y1}, ${x2} ${y2 - 40}, ${x2} ${y2}`;
    } else {
      const x1 = a.x + NODE_W + 6, y1 = a.y + HEAD_H + (NODE_H - HEAD_H) / 2;
      const x2 = b.x - 6, y2 = b.y + portY(e.to, e.inputIndex);
      const dx = Math.max(24, (x2 - x1) / 2);
      d = `M${x1} ${y1} C${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
    }
    const p = svgEl('path', { d, class: 'g-edge' + (e.uncertain ? ' is-uncertain' : '') + (e.back ? ' is-back' : '') + (ref ? ' is-ref' : ''), 'marker-end': ref || e.back ? 'url(#g-arrow-ref)' : 'url(#g-arrow)' });
    p.dataset.from = e.from; p.dataset.to = e.to;
    const tt = svgEl('title'); tt.textContent = ref || e.back ? `${e.from} → ${e.to} (${opts.refLabel || 'reference'})` : `${e.from} → ${e.to} [${opts.inputLabel || 'input'} ${e.inputIndex}]`;
    p.append(tt);
    edgeLayer.append(p);
    edgeEls.push(p);
  }

  const nodeEls = new Map();
  for (const n of nodes) {
    const { x, y } = L.coords.get(n.id);
    const g = svgEl('g', { class: 'g-node', transform: `translate(${x} ${y})`, tabindex: '0', role: 'button', 'data-fam': n.family, 'aria-label': opts.nodeLabel ? opts.nodeLabel(n) : `${n.type} ${n.id}` });
    g.dataset.id = n.id;
    const ports = L.inPorts.get(n.id);
    const hasIn = L.edges.some((e) => e.to === n.id && e.kind !== 'reference' && !e.back);
    g.append(
      svgEl('rect', { class: 'g-body', width: NODE_W, height: NODE_H, rx: 10 }),
      svgEl('path', { class: 'g-head', d: `M0 ${HEAD_H} V10 a10 10 0 0 1 10 -10 H${NODE_W - 10} a10 10 0 0 1 10 10 V${HEAD_H} Z` }),
      Object.assign(svgEl('text', { class: 'g-type', x: 10, y: 14 }), { textContent: clip(n.type, 22) }),
      Object.assign(svgEl('text', { class: 'g-id', x: 12, y: HEAD_H + 28 }), { textContent: clip(n.id, 20) }),
      svgEl('rect', { class: 'g-port', x: NODE_W, y: HEAD_H + (NODE_H - HEAD_H) / 2 - 5, width: 6, height: 10, rx: 1.5 }),
    );
    if (hasIn) {
      for (let k = 0; k < ports; k++) {
        g.append(svgEl('rect', { class: 'g-port', x: -6, y: portY(n.id, k) - 5, width: 6, height: 10, rx: 1.5 }));
        if (ports > 1) g.append(Object.assign(svgEl('text', { class: 'g-portn', x: 5, y: portY(n.id, k) + 4 }), { textContent: String(k) }));
      }
    }
    const step = opts.stepOf?.(n.id);
    if (step) {
      const bx = NODE_W - 16, by = HEAD_H + 22;
      g.append(svgEl('circle', { class: 'g-step', cx: bx, cy: by, r: 10 }), Object.assign(svgEl('text', { class: 'g-stepn', x: bx, y: by + 4 }), { textContent: String(step) }));
    }
    const title = svgEl('title'); title.textContent = `${n.type} — ${n.id}${n.purpose ? ': ' + n.purpose : ''}`;
    g.prepend(title);
    const select = () => opts.onSelect?.(n.id);
    g.addEventListener('click', select);
    g.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); select(); } });
    nodeLayer.append(g);
    nodeEls.set(n.id, g);
  }

  function highlight(set) {
    const on = set && set.size ? set : null;
    svg.classList.toggle('has-focus', !!on);
    for (const [id, g] of nodeEls) g.classList.toggle('is-active', !!on && on.has(id));
    for (const p of edgeEls) p.classList.toggle('is-active', !!on && on.has(p.dataset.from) && on.has(p.dataset.to));
  }
  return { svg, highlight, layout: L };
}

/* ---------- экспорт ---------- */
const STYLE_PROPS = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-opacity', 'opacity', 'font-family', 'font-size', 'font-weight'];

/** Сериализует SVG с подставленными вычисленными стилями (CSS-переменные вне страницы не работают). */
export function serializeSvg(svg, background) {
  const clone = svg.cloneNode(true);
  const src = svg.querySelectorAll('*'), dst = clone.querySelectorAll('*');
  src.forEach((node, i) => {
    const cs = getComputedStyle(node);
    const decl = STYLE_PROPS.map((p) => `${p}:${cs.getPropertyValue(p)}`).join(';');
    dst[i].setAttribute('style', decl);
    dst[i].removeAttribute('tabindex');
  });
  clone.classList.remove('has-focus');
  if (background) {
    const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    r.setAttribute('width', '100%'); r.setAttribute('height', '100%'); r.setAttribute('fill', background);
    clone.insertBefore(r, clone.firstChild);
  }
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(clone);
}

export function svgToPngBlob(svgText, width, height, scale = 2) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }));
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = Math.round(width * scale); c.height = Math.round(height * scale);
      const ctx = c.getContext('2d');
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('png'))), 'image/png');
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('svg')); };
    img.src = url;
  });
}
