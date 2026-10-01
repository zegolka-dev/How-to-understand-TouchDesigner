// Загрузка видео и извлечение кадров в браузере (логика прототипа: seek с ожиданием seeked).
import { AppError } from '../core/errors.js';

export const SMALL_W = 64, SMALL_H = 36;

/** Подключает файл к <video>, ждёт метаданные. */
export function loadVideo(file, video) {
  return new Promise((resolve, reject) => {
    if (video.src) URL.revokeObjectURL(video.src);
    video.muted = true; video.playsInline = true; video.preload = 'auto';
    const cleanup = () => { video.onloadedmetadata = null; video.onerror = null; };
    video.onloadedmetadata = () => {
      cleanup();
      const duration = video.duration;
      if (!isFinite(duration) || !duration) return reject(new AppError('videoDuration'));
      resolve({ duration, w: video.videoWidth, h: video.videoHeight });
    };
    video.onerror = () => { cleanup(); reject(new AppError('videoFormat')); };
    video.src = URL.createObjectURL(file);
  });
}

function seek(video, t) {
  return new Promise((resolve, reject) => {
    if (Math.abs(video.currentTime - t) < 1e-3 && video.readyState >= 2) return resolve();
    let done = false;
    const ok = () => { if (done) return; done = true; clearTimeout(timer); video.removeEventListener('seeked', ok); resolve(); };
    const timer = setTimeout(() => { if (done) return; done = true; video.removeEventListener('seeked', ok); reject(new AppError('videoSeek')); }, 8000);
    video.addEventListener('seeked', ok);
    video.currentTime = t;
  });
}

/** Ждёт, пока кадр после seek реально отрисуется (если браузер умеет). */
const nextFrame = (video) => new Promise((r) => (video.requestVideoFrameCallback ? video.requestVideoFrameCallback(() => r()) : r()));

/**
 * Берёт count кадров равномерно (в серединах отрезков), JPEG ≤ maxW px.
 * Возвращает { frames: [base64], urls: [dataURL], times, smalls: [Uint8ClampedArray 64×36 RGBA] }.
 */
export async function extractFrames(video, { count = 12, maxW = 768, quality = 0.72, onProgress, signal } = {}) {
  const dur = video.duration, w = video.videoWidth, h = video.videoHeight;
  const scale = Math.min(1, maxW / w);
  const cw = Math.max(2, Math.round(w * scale)), ch = Math.max(2, Math.round(h * scale));
  const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
  const cx = cv.getContext('2d');
  const sm = document.createElement('canvas'); sm.width = SMALL_W; sm.height = SMALL_H;
  const sx = sm.getContext('2d', { willReadFrequently: true });
  const frames = [], urls = [], times = [], smalls = [];
  video.pause();
  for (let i = 0; i < count; i++) {
    if (signal?.aborted) throw new AppError('aborted');
    const t = Math.min(dur - 0.05, Math.max(0, ((i + 0.5) / count) * dur));
    onProgress?.(i + 1, count);
    await seek(video, t);
    if (video.requestVideoFrameCallback && video.paused) await Promise.race([nextFrame(video), new Promise((r) => setTimeout(r, 120))]);
    cx.drawImage(video, 0, 0, cw, ch);
    const url = cv.toDataURL('image/jpeg', quality);
    urls.push(url); frames.push(url.slice(url.indexOf(',') + 1)); times.push(t);
    sx.drawImage(video, 0, 0, SMALL_W, SMALL_H);
    smalls.push(new Uint8ClampedArray(sx.getImageData(0, 0, SMALL_W, SMALL_H).data));
  }
  return { frames, urls, times, smalls, width: cw, height: ch };
}

/** Миниатюры для истории: k кадров из уже извлечённых, ширина 160 px. */
export async function makeThumbs(urls, k = 4, width = 160) {
  if (!urls.length) return [];
  const pick = Array.from({ length: Math.min(k, urls.length) }, (_, i) => urls[Math.floor(((i + 0.5) / Math.min(k, urls.length)) * urls.length)]);
  const out = [];
  for (const u of pick) {
    const img = new Image();
    // onload, а не decode(): decode() может не завершиться во фоновой вкладке
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = u; });
    const c = document.createElement('canvas');
    c.width = width; c.height = Math.max(2, Math.round((img.naturalHeight / img.naturalWidth) * width));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    out.push(c.toDataURL('image/jpeg', 0.6));
  }
  return out;
}
