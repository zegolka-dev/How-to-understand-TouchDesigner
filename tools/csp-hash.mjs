// Пересчитывает sha256 инлайн-скрипта темы в index.html и подставляет его в CSP.
// Запуск: node tools/csp-hash.mjs [--check]
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const file = new URL('../index.html', import.meta.url);
const html = readFileSync(file, 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) throw new Error('inline <script> not found');
const hash = 'sha256-' + createHash('sha256').update(m[1], 'utf8').digest('base64');
const next = html.replace(/'sha256-[^']*'/, `'${hash}'`);
if (process.argv.includes('--check')) {
  if (next !== html) { console.error('CSP hash is stale, run: node tools/csp-hash.mjs'); process.exit(1); }
  console.log('CSP hash OK', hash);
} else {
  writeFileSync(file, next);
  console.log('CSP hash set', hash);
}
