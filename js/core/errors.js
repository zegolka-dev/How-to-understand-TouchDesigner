// Единый тип ошибок приложения. code -> подсказка в словаре i18n: 'err.<code>'.
import { redact } from './dom.js';

export class AppError extends Error {
  /**
   * @param {string} code badKey|forbidden|region|notFoundModel|tooLarge|quota|server|network|timeout|blocked|empty|badRequest|aborted|noKey|noModels
   * @param {{status?:number, provider?:string, detail?:string, retryable?:boolean}} [info]
   */
  constructor(code, info = {}) {
    super(code);
    this.name = 'AppError';
    this.code = code;
    this.status = info.status ?? 0;
    this.provider = info.provider ?? '';
    this.detail = redact(info.detail ?? '').slice(0, 400);
    this.quota = code === 'quota';
    this.retryable = info.retryable ?? ['quota', 'server', 'network', 'timeout'].includes(code);
  }
}

export const toAppError = (e, provider) =>
  e instanceof AppError ? e
    : e?.name === 'AbortError' ? new AppError('aborted', { provider })
    : new AppError('network', { provider, detail: e?.message });
