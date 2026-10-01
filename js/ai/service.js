// analyze / followUp поверх provider.generate(): единые промт, схема и парсер для всех провайдеров.
import { getProvider, getModel, setModel, refreshModels, getAltModels } from '../providers/registry.js';
import { buildSystem, buildFollowUpSystem, buildFirstTurn } from './prompt.js';
import { RESPONSE_SCHEMA } from './schema.js';
import { parseAnalysis } from './parse.js';

async function modelFor(providerId) {
  let model = getModel(providerId);
  if (!model) { await refreshModels(providerId); model = getModel(providerId); }
  return model;
}

// При этих ошибках пробуем следующую модель того же провайдера (перегрузка/лимит конкретной модели).
const CHAIN_CODES = ['server', 'quota', 'notFoundModel', 'empty'];
export const MAX_MODELS = 3;

/**
 * Выполняет fn(model) на текущей модели, а при перегрузке/лимите — ещё на 1–2 следующих.
 * Успешная запасная модель запоминается. onModel(model, prevError) вызывается перед сменой модели.
 * При неудаче у ошибки есть triedModels.
 */
async function withModelChain(providerId, fn, { onModel, signal } = {}) {
  const first = await modelFor(providerId);
  const models = [first, ...getAltModels(providerId, first)].slice(0, MAX_MODELS);
  const tried = [];
  let lastErr;
  for (const [i, model] of models.entries()) {
    if (signal?.aborted) break;
    if (i) onModel?.(model, lastErr);
    tried.push(model);
    try {
      const res = await fn(model);
      if (i) setModel(providerId, model);
      return res;
    } catch (e) {
      lastErr = e;
      if (!CHAIN_CODES.includes(e.code)) break;
    }
  }
  if (lastErr) lastErr.triedModels = tried;
  throw lastErr;
}

/** Один запрос на разбор. Возвращает { data|null, raw, repaired, model, provider, firstTurn }. */
export async function analyze({ providerId, frames, times, metrics, lang, level, note, signal, onModel }) {
  const p = getProvider(providerId);
  const firstTurn = buildFirstTurn({ frames, times, metrics, note });
  const system = buildSystem({ lang, level });
  const res = await withModelChain(providerId, (model) => p.generate({
    system, messages: [firstTurn], json: true, schema: RESPONSE_SCHEMA, model, signal, maxTokens: 16384,
  }), { onModel, signal });
  const parsed = parseAnalysis(res.text);
  return { data: parsed.data, raw: res.text, repaired: !!parsed.repaired, model: res.model, provider: providerId, firstTurn };
}

/** Уточняющий вопрос. history — нейтральные сообщения (первое может содержать кадры). */
export async function followUp({ providerId, history, question, lang, level, signal, onModel }) {
  const p = getProvider(providerId);
  const messages = [...history, { role: 'user', parts: [{ text: question }] }];
  const system = buildFollowUpSystem({ lang, level });
  const res = await withModelChain(providerId, (model) => p.generate({ system, messages, json: false, model, signal, maxTokens: 4096 }), { onModel, signal });
  return { text: res.text, model: res.model };
}
