import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './e2e', timeout: 30_000, use: { baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000' },
  webServer: process.env.E2E_BASE_URL ? undefined : { command: 'npm run build && npm run start', url: 'http://localhost:3000', reuseExistingServer: true, timeout: 180_000 },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }, { name: 'tablet', use: { viewport: { width: 768, height: 1024 } } }, { name: 'mobile-360', use: { ...devices['Pixel 5'], viewport: { width: 360, height: 740 } } }, { name: 'mobile-390', use: { ...devices['iPhone 13'] } }],
});
