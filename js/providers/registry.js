// Реестр провайдеров: активный/запасной, выбранные модели, кэш списка моделей.
import { ls, bus } from '../core/store.js';
import { createGemini } from './gemini.js';
import { createOpenRouter } from './openrouter.js';

const keyOf = (id) => () => (ls.get(id + '.key') || '').trim();

export const PROVIDERS = {
  gemini: createGemini(keyOf('gemini')),
  openrouter: createOpenRouter(keyOf('openrouter')),
};
export const PROVIDER_IDS = Object.keys(PROVIDERS);

export const getProvider = (id) => PROVIDERS[id] || PROVIDERS.gemini;
export const hasKey = (id) => !!keyOf(id)();

export function getActiveId() {
  const id = ls.get('provider.active');
  return PROVIDERS[id] ? id : 'gemini';
}
export function setActiveId(id) {
  if (!PROVIDERS[id]) return;
  ls.set('provider.active', id);
  bus.emit('provider', { active: id });
}

/** Запасной провайдер: другой, у которого есть ключ. */
export const getFallbackId = (current) => PROVIDER_IDS.find((id) => id !== current && hasKey(id)) || null;

export const getModel = (id) => ls.get(id + '.model') || '';
export function setModel(id, model) { ls.set(id + '.model', model); bus.emit('model', { provider: id, model }); }

export const getCachedModels = (id) => ls.getJSON(id + '.models', []);

/** Другая модель того же провайдера (следующая по списку) — для перегрузки/лимита конкретной модели. */
export function getAltModel(id) {
  const models = getCachedModels(id);
  const cur = getModel(id);
  const i = models.findIndex((m) => m.id === cur);
  const rest = [...models.slice(i + 1), ...models.slice(0, Math.max(0, i))].filter((m) => m.id !== cur);
  return rest[0]?.id || null;
}

/** Загружает список моделей, кэширует, выбирает дефолт если текущая пропала. */
export async function refreshModels(id) {
  const p = getProvider(id);
  const models = await p.listModels();
  ls.setJSON(id + '.models', models);
  const cur = getModel(id);
  if (!models.some((m) => m.id === cur)) setModel(id, p.defaultModel(models));
  bus.emit('models', { provider: id, models });
  return models;
}

export async function testProvider(id) {
  const res = await getProvider(id).testConnection();
  ls.setJSON(id + '.models', res.models);
  const cur = getModel(id);
  if (!res.models.some((m) => m.id === cur)) setModel(id, getProvider(id).defaultModel(res.models));
  bus.emit('models', { provider: id, models: res.models });
  return res;
}
