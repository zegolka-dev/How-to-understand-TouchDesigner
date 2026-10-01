// Мастер первого запуска: 5 шагов в листе (sheet), можно вернуться назад.
import { h, icon } from '../core/dom.js';
import { ls } from '../core/store.js';
import { t } from '../core/i18n.js';
import { openSheet, setStatus, errorText } from './ui.js';
import { getKey, setKey } from './settings.js';
import { testProvider, getModel } from '../providers/registry.js';

const LINKS = {
  geminiKey: 'https://aistudio.google.com/apikey',
  geminiLimits: 'https://ai.google.dev/gemini-api/docs/rate-limits',
  geminiPricing: 'https://ai.google.dev/gemini-api/docs/pricing',
  orKeys: 'https://openrouter.ai/settings/keys',
  orLimits: 'https://openrouter.ai/docs/api-reference/limits',
};

const extLink = (href, label, cls = 'btn btn--secondary') =>
  h('a', { class: cls, href, target: '_blank', rel: 'noopener noreferrer' }, h('span', { text: label }), icon('external', 'icon--sm'));

function keyField(provider, placeholder) {
  const id = 'onb-key-' + provider;
  const input = h('input.input', { id, type: 'password', autocomplete: 'off', spellcheck: 'false', autocapitalize: 'off', placeholder });
  input.value = getKey(provider);
  input.addEventListener('input', () => setKey(provider, input.value));
  return h('div.field', {}, h('label.label', { for: id, text: t('settings.apiKey') }), h('div.input-group', {}, input));
}

function testBlock(provider) {
  const status = h('p.status', { 'aria-live': 'polite' });
  const btn = h('button.btn.btn--primary', { type: 'button' }, icon('check'), h('span', { text: t('onb.test') }));
  btn.addEventListener('click', async () => {
    if (!getKey(provider)) { setStatus(status, 'err', t('err.noKey')); return; }
    btn.disabled = true;
    setStatus(status, 'busy', t('onb.testing'));
    try {
      const res = await testProvider(provider);
      setStatus(status, 'ok', t('onb.testOk', { n: res.count, model: getModel(provider) }));
    } catch (e) {
      setStatus(status, 'err', errorText(e));
    } finally { btn.disabled = false; }
  });
  return h('div.stack', {}, h('div.row', {}, btn), status);
}

const list = (prefix, n) => h('ol.onb__steps', {}, Array.from({ length: n }, (_, i) => h('li', { text: t(`${prefix}${i + 1}`) })));

function steps() {
  return [
    () => [
      h('div.onb__hero', {}, icon('logo')),
      h('h3.onb__title', { tabindex: '-1', text: t('onb.welcome.title') }),
      h('p', { text: t('onb.welcome.p1') }),
      h('p.onb__note', { text: t('onb.welcome.p2') }),
      h('p.muted', { text: t('onb.welcome.p3') }),
    ],
    () => [
      h('h3.onb__title', { tabindex: '-1', text: t('onb.gemini.title') }),
      h('p.muted', { text: t('onb.gemini.lead') }),
      list('onb.gemini.s', 5),
      h('div.row', {}, extLink(LINKS.geminiKey, t('onb.openPage'))),
      keyField('gemini', 'AIza…'),
      h('p.hint', { text: t('settings.keyPrivacy') }),
    ],
    () => [
      h('h3.onb__title', { tabindex: '-1', text: t('onb.check.title') }),
      h('p.muted', { text: t('onb.check.lead') }),
      testBlock('gemini'),
    ],
    () => [
      h('h3.onb__title', { tabindex: '-1', text: t('onb.limits.title') }),
      h('p', { text: t('onb.limits.p1') }),
      h('p', { text: t('onb.limits.p2') }),
      h('p.onb__note', { text: t('onb.limits.p3') }),
      h('div.row', {}, extLink(LINKS.geminiLimits, t('onb.limits.link')), extLink(LINKS.geminiPricing, t('onb.limits.pricing'), 'btn btn--ghost')),
    ],
    () => [
      h('h3.onb__title', { tabindex: '-1', text: t('onb.or.title') }),
      h('p.muted', { text: t('onb.or.lead') }),
      list('onb.or.s', 5),
      h('div.row', {}, extLink(LINKS.orKeys, t('onb.openPage')), extLink(LINKS.orLimits, t('onb.or.limits'), 'btn btn--ghost')),
      keyField('openrouter', 'sk-or-…'),
      testBlock('openrouter'),
    ],
  ];
}

export function openOnboarding({ onDone } = {}) {
  const all = steps();
  let i = 0;
  const dots = h('div.onb__dots', { 'aria-hidden': 'true' }, all.map(() => h('span.onb__dot')));
  const count = h('span.onb__count');
  const content = h('div.onb.stack');
  const body = h('div.onb', {}, h('div.onb__progress', {}, dots, count), content);

  const back = h('button.btn.btn--ghost', { type: 'button' }, icon('chevron-left'), h('span', { text: t('common.back') }));
  const next = h('button.btn.btn--primary', { type: 'button' });
  const skip = h('button.btn.btn--ghost', { type: 'button', text: t('onb.skip') });

  const sheet = openSheet({
    title: t('onb.sheetTitle'), body, footer: [back, h('span.spacer'), skip, next],
    onClose: () => { ls.set('onboarded', '1'); onDone?.(); },
  });

  function render() {
    dots.querySelectorAll('.onb__dot').forEach((d, k) => { d.dataset.on = String(k === i); d.dataset.done = String(k < i); });
    count.textContent = t('onb.progress', { i: i + 1, n: all.length });
    content.replaceChildren(...all[i]());
    back.hidden = i === 0;
    skip.hidden = i !== all.length - 1;
    const last = i === all.length - 1;
    next.replaceChildren(h('span', { text: last ? t('common.done') : t('common.next') }), icon(last ? 'check' : 'chevron-right'));
    content.querySelector('.onb__title')?.focus();
  }
  back.addEventListener('click', () => { if (i > 0) { i--; render(); } });
  next.addEventListener('click', () => { if (i < all.length - 1) { i++; render(); } else sheet.close(); });
  skip.addEventListener('click', () => sheet.close());
  render();
  return sheet;
}

export const needsOnboarding = () => ls.get('onboarded') !== '1';
