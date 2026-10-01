// Общие хелперы e2e: мок API, тестовое видео, начальное состояние.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const FAKE_GEMINI = 'AIzaSyTEST_0000000000000000000000000000';
export const FAKE_OR = 'sk-or-v1-test000000000000000000000000';
const MP4 = fileURLToPath(new URL('../fixtures/test.mp4', import.meta.url));

export const ANALYSIS = {
  observations: ['Белый круг на цветном фоне', 'Круг двигается по горизонтали', 'За кругом тянется шлейф'],
  summary: 'Цветной фон и белый круг, который ходит **влево-вправо** и оставляет шлейф.',
  isLikelyTouchDesigner: true,
  techniques: [{ name: 'Feedback trails', why: 'шлейф <img src=x onerror="window.__xss=1">' }, { name: 'Transform', why: 'движение' }],
  nodes: [
    { id: 'circle1', type: 'Circle TOP', family: 'TOP', params: [{ name: 'Radius', value: '0.15', approximate: true }], purpose: 'круг' },
    { id: 'transform1', type: 'Transform TOP', family: 'TOP', params: [{ name: 'Translate X', value: 'sin(absTime.seconds*3)*0.3', approximate: false }], purpose: 'движение' },
    { id: 'lfo1', type: 'Lfo CHOP', family: 'CHOP', params: [{ name: 'Frequency', value: '0.5', approximate: true }], purpose: 'анимация' },
    { id: 'comp1', type: 'Composite TOP', family: 'TOP', params: [{ name: 'Operation', value: 'Add', approximate: false }], purpose: 'сборка' },
    { id: 'feedback1', type: 'Feedback TOP', family: 'TOP', params: [{ name: 'Target TOP', value: 'level1', approximate: false }], purpose: 'шлейф' },
    { id: 'level1', type: 'Level TOP', family: 'TOP', params: [{ name: 'Opacity', value: '0.95', approximate: true }], purpose: 'затухание' },
    { id: 'geo1', type: 'Geometry COMP', family: 'COMP', params: [], purpose: 'запасной вариант' },
    { id: 'out1', type: 'Out TOP', family: 'TOP', params: [], purpose: 'выход' },
  ],
  connections: [
    { from: 'circle1', to: 'transform1', inputIndex: 0 },
    { from: 'transform1', to: 'comp1', inputIndex: 0 },
    { from: 'feedback1', to: 'comp1', inputIndex: 1 },
    { from: 'comp1', to: 'level1', inputIndex: 0 },
    { from: 'level1', to: 'feedback1', inputIndex: 0 },
    { from: 'level1', to: 'out1', inputIndex: 0 },
    { from: 'lfo1', to: 'transform1', inputIndex: 1, uncertain: true },
  ],
  steps: [
    { n: 1, title: 'Круг', nodeIds: ['circle1'], details: 'Создайте `Circle TOP` (Tab → Circle).' },
    { n: 2, title: 'Движение', nodeIds: ['transform1', 'lfo1'], details: 'Translate X = `sin(absTime.seconds*3)*0.3`' },
    { n: 3, title: 'Шлейф', nodeIds: ['comp1', 'feedback1', 'level1'], details: '- Feedback TOP: Target TOP = level1\n- Level TOP Opacity 0.95' },
    { n: 4, title: 'Выход', nodeIds: ['out1'], details: 'Out TOP' },
  ],
  animation: ['`absTime.seconds*3` двигает круг'],
  postfx: ['Level TOP: лёгкое затухание'],
  tweakNotes: ['Opacity шлейфа'],
  uncertainties: ['Точный цвет фона'],
  confidence: 0.72,
};

export const geminiOk = (obj = ANALYSIS) => ({ candidates: [{ content: { parts: [{ text: typeof obj === 'string' ? obj : JSON.stringify(obj) }] }, finishReason: 'STOP' }] });
export const geminiModels = { models: [
  { name: 'models/gemini-9.9-flash', supportedGenerationMethods: ['generateContent'] },
  { name: 'models/gemini-9.9-flash-lite', supportedGenerationMethods: ['generateContent'] },
  { name: 'models/gemini-9.9-pro', supportedGenerationMethods: ['generateContent'] },
  { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
] };
export const orModels = { data: [
  { id: 'google/gemma-test:free', name: 'Gemma test', architecture: { input_modalities: ['text', 'image'] }, context_length: 8000 },
  { id: 'paid/model', name: 'Paid', architecture: { input_modalities: ['text', 'image'] } },
] };

/**
 * Перехватывает все сетевые запросы: разрешены только localhost; API — моки.
 * handlers: { gemini: (route, url, req) => ..., openrouter: ... }. Возвращает массив записанных внешних запросов.
 */
export async function mockNetwork(page, handlers = {}) {
  const external = [];
  await page.route('**/*', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.hostname === '127.0.0.1' || url.protocol === 'data:' || url.protocol === 'blob:') return route.continue();
    external.push({ url: req.url(), method: req.method(), headers: req.headers(), body: req.postData() || '' });
    if (url.hostname === 'generativelanguage.googleapis.com') {
      if (handlers.gemini) return handlers.gemini(route, url, req);
      if (url.pathname.endsWith('/models')) return route.fulfill({ json: geminiModels });
      return route.fulfill({ json: geminiOk() });
    }
    if (url.hostname === 'openrouter.ai') {
      if (handlers.openrouter) return handlers.openrouter(route, url, req);
      if (url.pathname.endsWith('/models')) return route.fulfill({ json: orModels });
      if (url.pathname.endsWith('/key')) return route.fulfill({ json: { data: { label: 'test' } } });
      return route.fulfill({ json: { choices: [{ message: { content: JSON.stringify(ANALYSIS) }, finish_reason: 'stop' }], model: 'google/gemma-test:free' } });
    }
    return route.abort();
  });
  return external;
}

/** Состояние «уже настроено»: ключ, модель, онбординг пройден. */
export async function presetStorage(page, extra = {}) {
  await page.addInitScript(([key, extra]) => {
    if (sessionStorage.getItem('__preset')) return;
    sessionStorage.setItem('__preset', '1');
    localStorage.setItem('tdx.onboarded', '1');
    localStorage.setItem('tdx.gemini.key', key);
    localStorage.setItem('tdx.gemini.model', 'gemini-9.9-flash');
    localStorage.setItem('tdx.lang', 'ru');
    for (const [k, v] of Object.entries(extra)) localStorage.setItem('tdx.' + k, v);
  }, [FAKE_GEMINI, extra]);
}

/** Загружает тестовое видео: mp4 из ffmpeg, если есть, иначе webm, сгенерированный в браузере. */
export async function loadTestVideo(page) {
  if (existsSync(MP4)) {
    await page.setInputFiles('#file', { name: 'test.mp4', mimeType: 'video/mp4', buffer: readFileSync(MP4) });
  } else {
    await page.evaluate(async () => {
      const c = document.createElement('canvas'); c.width = 320; c.height = 180;
      const x = c.getContext('2d');
      const rec = new MediaRecorder(c.captureStream(30), { mimeType: 'video/webm' });
      const chunks = []; rec.ondataavailable = (e) => chunks.push(e.data); rec.start();
      const t0 = performance.now();
      await new Promise((res) => { (function f() { const t = (performance.now() - t0) / 1000; x.fillStyle = `hsl(${t * 120},70%,40%)`; x.fillRect(0, 0, 320, 180); x.fillStyle = '#fff'; x.beginPath(); x.arc(160 + 100 * Math.sin(t * 3), 90, 30, 0, 7); x.fill(); if (t < 2.5) requestAnimationFrame(f); else res(); })(); });
      rec.stop(); await new Promise((r) => { rec.onstop = r; });
      const file = new File(chunks, 'test.webm', { type: 'video/webm' });
      const dt = new DataTransfer(); dt.items.add(file);
      document.querySelector('#video-card').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    });
  }
  await page.waitForFunction(() => document.querySelectorAll('#frames img').length > 0 && !document.querySelector('#go').disabled, null, { timeout: 30000 });
}

/** Собирает ошибки консоли страницы. */
export function collectErrors(page) {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}
