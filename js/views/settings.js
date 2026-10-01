// Вкладка «Настройки»: ключи провайдеров (хранятся только в localStorage этого браузера).
import { $, $$, h } from '../core/dom.js';
import { ls, bus } from '../core/store.js';
import { t } from '../core/i18n.js';
import { toast, confirmSheet, segmented, setStatus, errorText } from './ui.js';
import { PROVIDER_IDS, getActiveId, setActiveId, getModel, setModel, getCachedModels, refreshModels, testProvider, hasKey } from '../providers/registry.js';
import { openOnboarding } from './onboarding.js';

export const getKey = (provider) => (ls.get(provider + '.key') || '').trim();

export function setKey(provider, value) {
  const v = String(value || '').trim();
  if (v) ls.set(provider + '.key', v); else ls.remove(provider + '.key');
  bus.emit('keys', { provider });
}

export function initSettings() {
  for (const input of $$('input[data-key]')) {
    const p = input.dataset.key;
    input.value = getKey(p);
    input.addEventListener('input', () => setKey(p, input.value));
  }
  bus.on('keys', ({ provider }) => {
    const input = $(`input[data-key="${provider}"]`);
    if (input && input.value.trim() !== getKey(provider)) input.value = getKey(provider);
  });

  for (const btn of $$('[data-toggle-key]')) {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.toggleKey);
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.setAttribute('aria-pressed', String(show));
      const key = show ? 'settings.hideKey' : 'settings.showKey';
      btn.setAttribute('aria-label', t(key)); btn.title = t(key);
      btn.querySelector('use').setAttribute('href', show ? '#i-eye-off' : '#i-eye');
    });
  }

  initProviders();

  for (const btn of $$('[data-forget]')) {
    btn.addEventListener('click', async () => {
      const p = btn.dataset.forget;
      if (!getKey(p)) { toast(t('settings.noKeyToForget')); return; }
      const ok = await confirmSheet({ title: t('settings.forgetTitle'), text: t('settings.forgetText'), okLabel: t('settings.forgetKey'), danger: true });
      if (!ok) return;
      setKey(p, '');
      toast(t('settings.keyForgotten'), { type: 'ok' });
    });
  }
}

/* ---------- провайдеры и модели ---------- */
function fillModels(provider) {
  const sel = $(`select[data-model="${provider}"]`);
  if (!sel) return;
  const models = getCachedModels(provider);
  const cur = getModel(provider);
  sel.replaceChildren();
  if (!models.length) {
    sel.append(h('option', { value: '', text: t('settings.noModels') }));
    sel.disabled = true;
    return;
  }
  sel.disabled = false;
  for (const m of models) sel.append(h('option', { value: m.id, text: m.label }));
  if (cur && !models.some((m) => m.id === cur)) sel.prepend(h('option', { value: cur, text: cur }));
  sel.value = cur || models[0].id;
}

function updateBadges() {
  const active = getActiveId();
  for (const box of $$('.provider[data-provider]')) {
    const id = box.dataset.provider;
    const badge = $('.badge', box);
    if (!badge) continue;
    const isActive = id === active;
    badge.textContent = t(isActive ? 'settings.inUse' : hasKey(id) ? 'settings.backup' : 'settings.notSet');
    badge.className = 'badge' + (isActive ? '' : ' badge--muted');
  }
}

function initProviders() {
  const segEl = $('[data-seg="provider"]');
  const seg = segEl && segmented(segEl, { value: getActiveId(), onChange: (v) => setActiveId(v) });
  bus.on('provider', ({ active }) => { seg?.set(active); updateBadges(); });

  for (const id of PROVIDER_IDS) {
    fillModels(id);
    $(`select[data-model="${id}"]`)?.addEventListener('change', (e) => setModel(id, e.target.value));
    const status = $(`[data-status="${id}"]`);

    $(`[data-refresh="${id}"]`)?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      if (!hasKey(id)) { setStatus(status, 'err', t('err.noKey')); return; }
      btn.disabled = true; setStatus(status, 'busy', t('settings.loadingModels'));
      try {
        const models = await refreshModels(id);
        setStatus(status, 'ok', t('settings.modelsLoaded', { n: models.length }));
      } catch (err) { setStatus(status, 'err', errorText(err)); }
      finally { btn.disabled = false; }
    });

    $(`[data-test="${id}"]`)?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      if (!hasKey(id)) { setStatus(status, 'err', t('err.noKey')); return; }
      btn.disabled = true; setStatus(status, 'busy', t('onb.testing'));
      try {
        const res = await testProvider(id);
        setStatus(status, 'ok', t('onb.testOk', { n: res.count, model: getModel(id) }));
      } catch (err) { setStatus(status, 'err', errorText(err)); }
      finally { btn.disabled = false; }
    });
  }
  bus.on('models', ({ provider }) => fillModels(provider));
  bus.on('model', ({ provider }) => fillModels(provider));
  bus.on('keys', updateBadges);
  bus.on('lang', () => { updateBadges(); PROVIDER_IDS.forEach(fillModels); });
  updateBadges();

  $('#open-onboarding')?.addEventListener('click', () => openOnboarding());
}
