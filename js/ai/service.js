// analyze / followUp поверх provider.generate(): единые промт, схема и парсер для всех провайдеров.
import { getProvider, getModel, refreshModels } from '../providers/registry.js';
import { buildSystem, buildFollowUpSystem, buildFirstTurn } from './prompt.js';
import { RESPONSE_SCHEMA } from './schema.js';
import { parseAnalysis } from './parse.js';

async function modelFor(providerId) {
  let model = getModel(providerId);
  if (!model) { await refreshModels(providerId); model = getModel(providerId); }
  return model;
}

/** Один запрос на разбор. Возвращает { data|null, raw, repaired, model, provider, firstTurn }. */
export async function analyze({ providerId, frames, times, metrics, lang, level, note, signal }) {
  const p = getProvider(providerId);
  const model = await modelFor(providerId);
  const firstTurn = buildFirstTurn({ frames, times, metrics, note });
  const res = await p.generate({
    system: buildSystem({ lang, level }), messages: [firstTurn],
    json: true, schema: RESPONSE_SCHEMA, model, signal, maxTokens: 16384,
  });
  const parsed = parseAnalysis(res.text);
  return { data: parsed.data, raw: res.text, repaired: !!parsed.repaired, model: res.model, provider: providerId, firstTurn };
}

/** Уточняющий вопрос. history — нейтральные сообщения (первое может содержать кадры). */
export async function followUp({ providerId, history, question, lang, level, signal }) {
  const p = getProvider(providerId);
  const model = await modelFor(providerId);
  const messages = [...history, { role: 'user', parts: [{ text: question }] }];
  const res = await p.generate({ system: buildFollowUpSystem({ lang, level }), messages, json: false, model, signal, maxTokens: 4096 });
  return { text: res.text, model: res.model };
}
