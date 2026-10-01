// Генерирует tests/fixtures/test.mp4 через ffmpeg (если он есть в PATH).
// Без ffmpeg тесты сами создают webm в браузере (canvas + MediaRecorder).
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const out = fileURLToPath(new URL('./test.mp4', import.meta.url));
const r = spawnSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=30:duration=6', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { stdio: 'inherit' });
if (r.error) { console.log('ffmpeg not found: tests will generate a webm in the browser'); process.exit(0); }
process.exit(r.status ?? 0);
