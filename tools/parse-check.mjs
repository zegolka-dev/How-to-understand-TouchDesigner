// Быстрая проверка parse.js на типовых поломках: node tools/parse-check.mjs
import { parseAnalysis } from '../js/ai/parse.js';
const good = { summary: 'S', isLikelyTouchDesigner: true, techniques: ['Feedback'], nodes: [{ id: 'noise1', type: 'Noise TOP', family: 'TOP', params: [{ name: 'Period', value: '2', approximate: true }], purpose: 'p' }, { id: 'comp1', type: 'Composite TOP', params: [], purpose: '' }], connections: [{ from: 'noise1', to: 'comp1', inputIndex: 0 }, { from: 'x', to: 'comp1', inputIndex: 0 }], steps: [{ n: 1, title: 'T', nodeIds: ['noise1'], details: 'd' }], animation: [], postfx: [], tweakNotes: [], uncertainties: [], confidence: 70 };
const full = JSON.stringify(good);
const cases = {
  plain: full,
  fenced: '```json\n' + full + '\n```',
  prose: 'Here you go:\n' + full + '\nHope it helps',
  trailingComma: full.replace('"postfx":[]', '"postfx":[],').replace(/}$/, ',}'),
  truncatedMid: full.slice(0, full.indexOf('"steps"') + 40),
  truncatedInString: full.slice(0, full.indexOf('"purpose":"p"') + 11),
  garbage: 'Sorry, I cannot help with that.',
};
let fail = 0;
for (const [name, raw] of Object.entries(cases)) {
  const r = parseAnalysis(raw);
  const ok = name === 'garbage' ? r.data === null && r.raw : r.data && r.data.nodes.length >= 1;
  if (!ok) fail++;
  console.log(ok ? 'ok  ' : 'FAIL', name, r.data ? `nodes=${r.data.nodes.length} conns=${r.data.connections.length} steps=${r.data.steps.length} conf=${r.data.confidence} fam=${r.data.nodes[1]?.family} repaired=${r.repaired}` : 'raw');
}
process.exit(fail ? 1 : 0);
