import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60000,
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:8766', trace: 'retain-on-failure' },
  webServer: { command: 'python -m http.server 8766 --bind 127.0.0.1', url: 'http://127.0.0.1:8766/index.html', reuseExistingServer: true, timeout: 20000, stdout: 'ignore', stderr: 'ignore' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 860 } } }],
});
