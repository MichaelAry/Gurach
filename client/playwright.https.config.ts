import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests/e2e', testMatch: 'production-cookie.spec.ts',
  use: { baseURL: 'https://127.0.0.1:3443', ignoreHTTPSErrors: true },
  webServer: [
    { command: 'node tests/e2e/api-fixture.mjs', url: 'http://127.0.0.1:5300/health', timeout: 30000 },
    { command: 'node tests/e2e/https-production.mjs', url: 'https://127.0.0.1:3443/login', ignoreHTTPSErrors: true, timeout: 120000 },
  ],
})
