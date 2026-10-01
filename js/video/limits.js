// Ограничения на входное видео и оценка размера запроса.
import { AppError } from '../core/errors.js';

export const MAX_DURATION = 10 * 60;            // секунд
export const MAX_SIZE = 500 * 1024 * 1024;      // байт
export const FRAMES = { min: 6, max: 24, def: 12 };
export const WARN_REQUEST = 15 * 1024 * 1024;   // больше — предупреждаем (у Gemini лимит inline-запроса ~20 МБ)

const VIDEO_EXT = /\.(mp4|m4v|mov|webm|mkv|ogv|avi)$/i;

export function checkFile(file) {
  if (!file) throw new AppError('videoFormat');
  if (!/^video\//.test(file.type) && !VIDEO_EXT.test(file.name)) throw new AppError('notVideo');
  if (file.size > MAX_SIZE) throw new AppError('videoTooBig');
}

export function checkDuration(duration) {
  if (duration > MAX_DURATION) throw new AppError('videoTooLong');
}

/** Примерный размер тела запроса в байтах: base64 кадров + текст + служебное. */
export function estimateRequestBytes(frames, textLen = 6000) {
  return frames.reduce((s, b64) => s + b64.length, 0) + textLen + 2048;
}

/** Оценка до извлечения: средний размер одного кадра × count. */
export const estimateFromAvg = (avgFrameB64, count, textLen = 6000) => avgFrameB64 * count + textLen + 2048;
