import { defineConfig, devices } from '@playwright/test';
import { existsSync, readdirSync } from 'node:fs';

/** Chromium is the only browser engine available in the CI image; see docs/RELEASE_READINESS.md for the gap. */
function chromium(): string | undefined {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers';
  if (!existsSync(base)) return undefined;
  const dir = readdirSync(base).find((d) => d.startsWith('chromium-'));
  const p = dir ? `${base}/${dir}/chrome-linux/chrome` : undefined;
  return p && existsSync(p) ? p : undefined;
}

const PORT = Number(process.env.E2E_PORT ?? 8090);

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'test-results/e2e-report' }]],
  outputDir: 'test-results/e2e',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
    launchOptions: { executablePath: chromium() },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }, testIgnore: /mobile\..*spec\.ts/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /mobile\..*spec\.ts/ },
  ],
  webServer: {
    command: 'node --import tsx --conditions=development tests/e2e/server.mjs',
    url: `http://127.0.0.1:${PORT}/healthz`,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
