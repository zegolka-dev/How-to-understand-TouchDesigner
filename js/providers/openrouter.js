// OpenRouter (openrouter.ai) — запасной провайдер, только бесплатные модели (:free) с поддержкой изображений.
import { fetchJson, defaultMap, retryOnServer } from './base.js';
import { AppError } from '../core/errors.js';

const API = 'https://openrouter.ai/api/v1';

function mapStatus(status, detail, json, provider) {
  const info = { status, detail, provider };
  if (status === 401) return new AppError('badKey', info);
  if (status === 402 || status === 429) return new AppError('quota', info);
  if (status === 400 && /model/i.test(detail) && /(not|invalid|exist)/i.test(detail)) return new AppError('notFoundModel', info);
  return defaultMap(status, detail, json, provider);
}

const PREFER = /(gemini|qwen.*vl|llama.*vision|gemma|mistral.*small|pixtral)/i;

export function createOpenRouter(getKey) {
  const headers = (json) => {
    const key = getKey();
    if (!key) throw new AppError('noKey', { provider: 'openrouter' });
    const h = { Authorization: 'Bearer ' + key, 'X-Title': 'TD Explainer' };
    if (json) h['Content-Type'] = 'application/json';
    return h;
  };

  async function listModels() {
    const j = await fetchJson(API + '/models', { headers: headers(false), timeout: 15000, provider: 'openrouter', mapStatus });
    const list = (j.data || []).filter((m) => {
      const id = String(m.id || '');
      const arch = m.architecture || {};
      const vision = (arch.input_modalities || []).includes('image') || /image/.test(arch.modality || '');
      return id.endsWith(':free') && vision;
    });
    if (!list.length) throw new AppError('noModels', { provider: 'openrouter' });
    list.sort((a, b) => (PREFER.test(b.id) - PREFER.test(a.id)) || (b.context_length || 0) - (a.context_length || 0) || (a.id < b.id ? -1 : 1));
    return list.map((m) => ({ id: m.id, label: m.name ? `${m.name} (${m.id})` : m.id }));
  }

  function toMessages(system, messages) {
    const out = system ? [{ role: 'system', content: system }] : [];
    for (const m of messages) {
      const hasImage = m.parts.some((p) => p.image);
      if (m.role === 'model') { out.push({ role: 'assistant', content: m.parts.map((p) => p.text || '').join('') }); continue; }
      out.push({
        role: 'user',
        content: hasImage
          ? m.parts.map((p) => (p.image ? { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + p.image } } : { type: 'text', text: p.text }))
          : m.parts.map((p) => p.text || '').join('\n'),
      });
    }
    return out;
  }

  async function generate({ system, messages, json = false, model, signal, maxTokens = 8192 }) {
    if (!model) throw new AppError('notFoundModel', { provider: 'openrouter' });
    const body = { model, messages: toMessages(system, messages), temperature: 0.4, max_tokens: maxTokens };
    if (json) body.response_format = { type: 'json_object' };
    const call = (b) => retryOnServer(() => fetchJson(API + '/chat/completions', { method: 'POST', headers: headers(true), body: JSON.stringify(b), timeout: 150000, signal, provider: 'openrouter', mapStatus }), { signal });
    let j;
    try {
      j = await call(body);
    } catch (e) {
      if (e.code === 'badRequest' && json && /response_format|json/i.test(e.detail)) { delete body.response_format; j = await call(body); }
      else throw e;
    }
    // OpenRouter может вернуть ошибку провайдера внутри 200
    if (j.error) throw mapStatus(Number(j.error.code) || 500, j.error.message || '', j, 'openrouter');
    const c = j.choices?.[0];
    const text = c?.message?.content || '';
    if (!text) throw new AppError('empty', { provider: 'openrouter', detail: c?.finish_reason || '' });
    return { text, model: j.model || model, finishReason: c.finish_reason || '' };
  }

  async function testConnection() {
    await fetchJson(API + '/key', { headers: headers(false), timeout: 15000, provider: 'openrouter', mapStatus });
    const models = await listModels();
    return { ok: true, count: models.length, models };
  }

  return {
    id: 'openrouter', name: 'OpenRouter',
    listModels, generate, testConnection,
    defaultModel: (models) => models[0]?.id || '',
    supportsSchema: false,
  };
}
