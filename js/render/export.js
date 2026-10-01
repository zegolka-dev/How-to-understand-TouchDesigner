// Экспорт: Markdown-файл, буфер обмена, печать (PDF), скачивание файлов.
import { t, fmtDate } from '../core/i18n.js';

export function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.rel = 'noopener';
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* fallback ниже */ }
  const ta = document.createElement('textarea');
  ta.value = text; ta.setAttribute('readonly', ''); ta.className = 'sr-only';
  document.body.append(ta); ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  ta.remove();
  return ok;
}

export function printPdf() {
  document.querySelectorAll('.res-details').forEach((d) => { d.open = true; });
  window.print();
}

export function baseName(record) {
  const base = (record.fileName || 'td-explainer').replace(/\.[^.]+$/, '').replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 60) || 'td-explainer';
  return 'td-explainer_' + base;
}

/** Markdown из записи. Тексты модели вставляются как есть (это файл, не HTML). */
export function toMarkdown(record) {
  const r = record.result;
  const L = [];
  L.push(`# TD Explainer — ${record.fileName || ''}`.trim());
  L.push(`_${fmtDate(record.createdAt)} · ${record.model || ''}_`, '');
  if (!r) {
    L.push(record.raw || '');
  } else {
    if (!r.isLikelyTouchDesigner) L.push(`> ${t('result.notTd')}`, '');
    L.push(`## ${t('result.summary')}`, r.summary, '');
    if (r.observations?.length) { L.push(`### ${t('result.observations')}`); r.observations.forEach((x) => L.push('- ' + x)); L.push(''); }
    L.push(`${t('result.confidence')}: ${Math.round(r.confidence * 100)}%`, '');
    if (r.techniques.length) {
      L.push(`## ${t('result.techniques')}`);
      r.techniques.forEach((x) => L.push(`- **${x.name}**${x.why ? ' — ' + x.why : ''}`));
      L.push('');
    }
    if (r.nodes.length) {
      L.push(`## ${t('result.graph')}`);
      r.nodes.forEach((n) => {
        L.push(`- \`${n.id}\` — ${n.type}${n.purpose ? ': ' + n.purpose : ''}`);
        n.params.forEach((p) => L.push(`  - ${p.name} = \`${p.value}\`${p.approximate ? ' ≈' : ''}`));
      });
      if (r.connections.length) {
        L.push('', '```');
        r.connections.forEach((c) => L.push(`${c.from} -> ${c.to} [${t('result.input')} ${c.inputIndex}]${c.uncertain ? ' ?' : ''}`));
        L.push('```');
      }
      L.push('');
    }
    if (r.steps.length) {
      L.push(`## ${t('result.steps')}`);
      r.steps.forEach((s) => {
        const done = record.doneSteps?.includes(s.n) ? 'x' : ' ';
        L.push(`- [${done}] **${s.n}. ${s.title}**${s.nodeIds.length ? ` (${s.nodeIds.map((x) => '`' + x + '`').join(', ')})` : ''}`);
        if (s.details) L.push('  ' + s.details.replace(/\n/g, '\n  '));
      });
      L.push('');
    }
    const list = (key, arr) => { if (arr.length) { L.push(`## ${t(key)}`); arr.forEach((x) => L.push('- ' + x)); L.push(''); } };
    list('result.animation', r.animation);
    list('result.postfx', r.postfx);
    list('result.tweak', r.tweakNotes);
    list('result.uncertain', r.uncertainties);
    L.push(`_≈ — ${t('result.approx')}_`);
  }
  if (record.chat?.length) {
    L.push('', `## ${t('chat.title')}`);
    record.chat.forEach((m) => L.push(m.role === 'user' ? `**> ${m.text}**` : m.text, ''));
  }
  return L.join('\n');
}
