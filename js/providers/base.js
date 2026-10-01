// Общий контракт провайдеров и сетевой слой.
//
// Нейтральный формат сообщений:
//   { role: 'user' | 'model', parts: [{ text } | { image: '<base64 jpeg>' }] }
// Провайдер реализует:
//   generate({ system, messages, json, schema, model, signal }) -> { text, model, finishReason }
//   listModels() -> [{ id, label }]
//   testConnection() -> { ok: true, count }
//   defaultModel(models) -> id
// analyze/followUp строятся поверх generate (см. registry.js).
import { AppError, toAppError } from '../core/errors.js';

/**
 * fetch + JSON + таймаут. Ошибки HTTP превращаются в AppError через mapStatus провайдера.
 * Ключ передаётся только в headers и нигде не логируется.
 */
export async function fetchJson(url, { method = 'GET', headers = {}, body, timeout = 60000, signal, provider, mapStatus } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new DOMException('timeout', 'TimeoutError')), timeout);
  const onAbort = () => ctrl.abort(signal.reason);
  signal?.addEventListener('abort', onAbort, { once: true });
  let res;
  try {
    res = await fetch(url, { method, headers, body, signal: ctrl.signal, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store' });
  } catch (e) {
    if (ctrl.signal.reason?.name === 'TimeoutError') throw new AppError('timeout', { provider });
    if (signal?.aborted) throw new AppError('aborted', { provider });
    throw toAppError(e, provider);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
  let json = null;
  const text = await res.text().catch(() => '');
  try { json = text ? JSON.parse(text) : {}; } catch { json = null; }
  if (!res.ok) {
    const detail = json?.error?.message || json?.message || text.slice(0, 300) || 'HTTP ' + res.status;
    throw (mapStatus || defaultMap)(res.status, detail, json, provider);
  }
  if (json === null) throw new AppError('badRequest', { provider, status: res.status, detail: 'Invalid JSON from API' });
  return json;
}

/** Один повтор при перегрузке сервера (503/500 — «high demand»), с паузой. */
export async function retryOnServer(fn, { signal, delay = 2500 } = {}) {
  try { return await fn(); } catch (e) {
    if (e.code !== 'server' || signal?.aborted) throw e;
    await new Promise((r) => setTimeout(r, delay));
    if (signal?.aborted) throw e;
    return fn();
  }
}

export function defaultMap(status, detail, json, provider) {
  const info = { status, detail, provider };
  if (status === 401) return new AppError('badKey', info);
  if (status === 403) return new AppError('forbidden', info);
  if (status === 404) return new AppError('notFoundModel', info);
  if (status === 413) return new AppError('tooLarge', info);
  if (status === 429) return new AppError('quota', info);
  if (status >= 500) return new AppError('server', info);
  return new AppError('badRequest', info);
}
