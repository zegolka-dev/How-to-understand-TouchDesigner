// Мини-рендер Markdown из прототипа: сначала экранирование, потом разметка. Ссылки не превращаются в <a>.
import { escapeHtml as esc } from '../core/dom.js';

function inline(s) {
  s = esc(s);
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  s = s.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>');
  return s;
}

/** Возвращает безопасную HTML-строку (все данные экранированы). */
export function md(src) {
  const lines = String(src || '').replace(/\r/g, '').split('\n');
  const out = [];
  let i = 0, list = null;
  const closeList = () => { if (list) { out.push('</' + list + '>'); list = null; } };
  while (i < lines.length) {
    const ln = lines[i];
    if (/^```/.test(ln)) {
      closeList();
      const buf = []; i++;
      while (i < lines.length && !/^```/.test(lines[i])) { buf.push(lines[i]); i++; }
      i++;
      out.push('<pre><code>' + esc(buf.join('\n')) + '</code></pre>');
      continue;
    }
    const hd = ln.match(/^(#{1,4})\s+(.*)$/);
    if (hd) { closeList(); const lvl = Math.min(4, hd[1].length + 1); out.push(`<h${lvl}>${inline(hd[2])}</h${lvl}>`); i++; continue; }
    const ol = ln.match(/^\s*\d+[.)]\s+(.*)$/);
    const ul = ln.match(/^\s*[-*•]\s+(.*)$/);
    if (ol) { if (list !== 'ol') { closeList(); out.push('<ol>'); list = 'ol'; } out.push('<li>' + inline(ol[1]) + '</li>'); i++; continue; }
    if (ul) { if (list !== 'ul') { closeList(); out.push('<ul>'); list = 'ul'; } out.push('<li>' + inline(ul[1]) + '</li>'); i++; continue; }
    if (/^\s*---+\s*$/.test(ln)) { closeList(); out.push('<hr>'); i++; continue; }
    if (!ln.trim()) { closeList(); i++; continue; }
    closeList(); out.push('<p>' + inline(ln) + '</p>'); i++;
  }
  closeList();
  return out.join('\n');
}

/** Вставляет отрендеренный Markdown в элемент. */
export function renderMd(el, src) {
  el.classList.add('md');
  el.innerHTML = md(src); // безопасно: md() экранирует весь ввод до добавления разметки
  return el;
}

/** Инлайн-разметка (`код`, **жирный**) для коротких строк результата. */
export function renderInline(el, src) {
  el.innerHTML = inline(String(src || ''));
  return el;
}
