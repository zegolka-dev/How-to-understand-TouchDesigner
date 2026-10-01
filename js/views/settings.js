// Вкладка «Настройки»: ключи провайдеров (хранятся только в localStorage этого браузера).
import { $, $$ } from '../core/dom.js';
import { ls, bus } from '../core/store.js';
import { t } from '../core/i18n.js';
import { toast, confirmSheet } from './ui.js';

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
