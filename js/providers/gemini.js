// Google Gemini (generativelanguage.googleapis.com). Ключ только в заголовке x-goog-api-key.
import { fetchJson, defaultMap } from './base.js';
import { AppError } from '../core/errors.js';

const API = 'https://generativelanguage.googleapis.com/v1beta';
const EXCLUDE = /(tts|image|embedding|live|audio|robotics|computer|aqa|native)/i;

function mapStatus(status, detail, json, provider) {
  const info = { status, detail, provider };
  const reason = JSON.stringify(json?.error?.details || '') + ' ' + (json?.error?.status || '');
  if (status === 400 && /API[_ ]?key/i.test(detail + reason)) return new AppError('badKey', info);
  if (status === 400 && /location is not supported|FAILED_PRECONDITION/i.test(detail + reason)) return new AppError('region', info);
  if (status === 403 && /location|region|country/i.test(detail)) return new AppError('region', info);
  if (status === 429 || /RESOURCE_EXHAUSTED/.test(reason)) return new AppError('quota', info);
  return defaultMap(status, detail, json, provider);
}

function rank(id) {
  // flash (не lite) -> flash-lite -> pro -> прочее; внутри — более новая версия выше
  const tier = /flash-lite/.test(id) ? 1 : /flash/.test(id) ? 0 : /pro/.test(id) ? 2 : 3;
  const preview = /(preview|exp|experimental)/.test(id) ? 1 : 0;
  const ver = parseFloat((id.match(/gemini-(\d+(?:\.\d+)?)/) || [])[1] || '0');
  return { tier, preview, ver };
}

export function sortGeminiModels(ids) {
  return [...ids].sort((a, b) => {
    const A = rank(a), B = rank(b);
    return A.tier - B.tier || A.preview - B.preview || B.ver - A.ver || (a < b ? 1 : -1);
  });
}

export function createGemini(getKey) {
  const headers = (json) => {
    const key = getKey();
    if (!key) throw new AppError('noKey', { provider: 'gemini' });
    return json ? { 'Content-Type': 'application/json', 'x-goog-api-key': key } : { 'x-goog-api-key': key };
  };

  async function listModels() {
    const j = await fetchJson(API + '/models?pageSize=200', { headers: headers(false), timeout: 15000, provider: 'gemini', mapStatus });
    const ids = (j.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map((m) => String(m.name || '').replace(/^models\//, ''))
      .filter((id) => /^gemini/.test(id) && !EXCLUDE.test(id));
    if (!ids.length) throw new AppError('noModels', { provider: 'gemini' });
    return sortGeminiModels(ids).map((id) => ({ id, label: id }));
  }

  function toContents(messages) {
    return messages.map((m) => ({
      role: m.role === 'model' ? 'model' : 'user',
      parts: m.parts.map((p) => (p.image ? { inline_data: { mime_type: 'image/jpeg', data: p.image } } : { text: p.text })),
    }));
  }

  async function generate({ system, messages, json = false, schema, model, signal, maxTokens = 8192 }) {
    if (!model) throw new AppError('notFoundModel', { provider: 'gemini' });
    const generationConfig = { temperature: 0.4, maxOutputTokens: maxTokens };
    if (json) { generationConfig.responseMimeType = 'application/json'; if (schema) generationConfig.responseSchema = schema; }
    const body = { contents: toContents(messages), generationConfig };
    if (system) body.system_instruction = { parts: [{ text: system }] };
    const url = API + '/models/' + encodeURIComponent(model) + ':generateContent';
    const call = (b) => fetchJson(url, { method: 'POST', headers: headers(true), body: JSON.stringify(b), timeout: 120000, signal, provider: 'gemini', mapStatus });
    let j;
    try {
      j = await call(body);
    } catch (e) {
      // модель не поддерживает схему/JSON-режим — повторяем без них, промт всё равно просит JSON
      if (e.code === 'badRequest' && json && /schema|mime|response/i.test(e.detail)) {
        delete generationConfig.responseSchema;
        try { j = await call(body); } catch (e2) {
          if (e2.code !== 'badRequest') throw e2;
          delete generationConfig.responseMimeType;
          j = await call(body);
        }
      } else throw e;
    }
    const c = j.candidates?.[0];
    if (!c) {
      const br = j.promptFeedback?.blockReason;
      throw new AppError(br ? 'blocked' : 'empty', { provider: 'gemini', detail: br || '' });
    }
    const text = (c.content?.parts || []).map((p) => p.text || '').join('');
    if (!text) throw new AppError(c.finishReason === 'SAFETY' ? 'blocked' : 'empty', { provider: 'gemini', detail: c.finishReason || '' });
    return { text, model, finishReason: c.finishReason || '' };
  }

  async function testConnection() {
    const models = await listModels();
    return { ok: true, count: models.length, models };
  }

  return {
    id: 'gemini', name: 'Google Gemini',
    listModels, generate, testConnection,
    defaultModel: (models) => models[0]?.id || '',
    supportsSchema: true,
  };
}
