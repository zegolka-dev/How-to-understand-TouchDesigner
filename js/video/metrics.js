// Метрики по маленьким (64×36) копиям кадров — формулы прототипа.

/** Средняя попиксельная разница RGB двух кадров, 0..1 */
function diff(a, b) {
  let s = 0, c = 0;
  for (let k = 0; k < a.length; k += 4) {
    s += Math.abs(a[k] - b[k]) + Math.abs(a[k + 1] - b[k + 1]) + Math.abs(a[k + 2] - b[k + 2]);
    c += 3;
  }
  return c ? s / c / 255 : 0;
}

export const LOOP_THRESHOLD = 0.04;

/** motionLevel: 0 очень медленно, 1 плавно, 2 заметно, 3 очень быстро */
export const motionLevel = (m) => (m < 0.02 ? 0 : m < 0.06 ? 1 : m < 0.15 ? 2 : 3);

export function computeMetrics(smalls, { duration, w, h }) {
  let motion = 0;
  for (let j = 1; j < smalls.length; j++) motion += diff(smalls[j - 1], smalls[j]);
  motion = smalls.length > 1 ? motion / (smalls.length - 1) : 0;
  const loopDiff = smalls.length > 1 ? diff(smalls[0], smalls[smalls.length - 1]) : 1;

  const colorCount = new Map();
  let lumSum = 0, lumN = 0;
  for (const d of smalls) {
    for (let p = 0; p < d.length; p += 16) {
      const r = d[p], g = d[p + 1], b = d[p + 2];
      lumSum += 0.2126 * r + 0.7152 * g + 0.0722 * b; lumN++;
      const key = (r >> 6) * 16 + (g >> 6) * 4 + (b >> 6);
      colorCount.set(key, (colorCount.get(key) || 0) + 1);
    }
  }
  const palette = [...colorCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([key]) => {
    const q = [(key >> 4) & 3, (key >> 2) & 3, key & 3].map((x) => Math.min(255, x * 64 + 32));
    return '#' + q.map((x) => x.toString(16).padStart(2, '0')).join('');
  });

  return {
    duration, w, h,
    motion, motionLevel: motionLevel(motion),
    loopDiff, looped: loopDiff < LOOP_THRESHOLD,
    brightness: lumN ? lumSum / lumN / 255 : 0,
    palette,
  };
}
