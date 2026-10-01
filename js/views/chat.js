// Уточняющие вопросы к результату. Кадры уходят только в первом сообщении сессии.
import { h, icon } from '../core/dom.js';
import { bus } from '../core/store.js';
import { t, getLang } from '../core/i18n.js';
import { renderMd } from '../render/markdown.js';
import { setStatus, errorText } from './ui.js';
import { followUp } from '../ai/service.js';
import { getActiveId, setActiveId, getFallbackId, getProvider, hasKey, getAltModel, setModel } from '../providers/registry.js';

/**
 * session: { record, history, live } — history: нейтральные сообщения до чата
 * (живой разбор: кадры + ответ модели; из истории: текстовый контекст).
 */
export function renderChat(slot, session) {
  const { record } = session;
  const log = h('div.chat__log', { role: 'log', 'aria-live': 'polite' });
  const input = h('textarea.textarea.chat__input', { id: 'chat-input', rows: '2', maxlength: '2000', placeholder: t('chat.placeholder') });
  const send = h('button.btn.btn--primary', { type: 'button' }, icon('send'), h('span', { text: t('chat.send') }));
  const status = h('p.status', { 'aria-live': 'polite' });
  const actions = h('div.row');
  const card = h('section.card.glass.glass--dense.res-card.chat', { 'aria-labelledby': 'h-chat' },
    h('h2.card__title', { id: 'h-chat' }, icon('chat'), h('span', { text: t('chat.title') })),
    h('p.hint', { text: t(session.live ? 'chat.hintLive' : 'chat.hintHistory') }),
    log,
    h('label.sr-only', { for: 'chat-input', text: t('chat.placeholder') }),
    h('div.chat__form', {}, input, send),
    status, actions);
  slot.replaceChildren(card);

  const bubble = (m) => (m.role === 'user'
    ? h('div.msg.msg--user', {}, h('span', { text: m.text }))
    : renderMd(h('div.msg.msg--model'), m.text));
  record.chat.forEach((m) => log.append(bubble(m)));

  let busy = false;
  async function ask(providerId = getActiveId(), retryText) {
    const q = retryText ?? input.value.trim();
    if (!q || busy) return;
    actions.replaceChildren();
    if (!hasKey(providerId)) { setStatus(status, 'err', t('err.noKey')); return; }
    busy = true; send.disabled = true;
    let qEl = null;
    if (!retryText) { qEl = bubble({ role: 'user', text: q }); log.append(qEl); input.value = ''; }
    setStatus(status, 'busy', t('chat.thinking'));
    const history = [...session.history, ...record.chat.map((m) => ({ role: m.role, parts: [{ text: m.text }] }))];
    try {
      const res = await followUp({ providerId, history, question: q, lang: getLang(), level: record.level, onModel: (m) => setStatus(status, 'busy', t('analyze.switchingModel', { model: m })) });
      record.chat.push({ role: 'user', text: q }, { role: 'model', text: res.text });
      if (retryText) log.append(bubble({ role: 'user', text: q }));
      const a = bubble({ role: 'model', text: res.text });
      log.append(a);
      setStatus(status, '', '');
      bus.emit('record-changed', record);
      a.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (e) {
      qEl?.remove();
      if (!retryText) input.value = q;
      setStatus(status, 'err', errorText(e));
      const alt = ['server', 'quota', 'notFoundModel', 'empty', 'timeout'].includes(e.code) ? getAltModel(providerId, e.triedModels || []) : null;
      if (alt) actions.append(h('button.btn.btn--primary.btn--sm', { type: 'button', on: { click: () => { setModel(providerId, alt); input.value = ''; ask(providerId, q); } } }, icon('refresh', 'icon--sm'), h('span', { text: t('analyze.tryModel', { model: alt }) })));
      const fb = e.quota || e.code === 'server' ? getFallbackId(providerId) : null;
      if (fb) actions.append(h('button.btn.btn--secondary.btn--sm', { type: 'button', on: { click: () => { setActiveId(fb); input.value = ''; ask(fb, q); } } }, icon('refresh', 'icon--sm'), h('span', { text: t('analyze.switchRetry', { provider: getProvider(fb).name }) })));
    } finally { busy = false; send.disabled = false; }
  }
  send.addEventListener('click', () => ask());
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); } });
}
