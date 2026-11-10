import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  testIgnore: 'production-cookie.spec.ts',
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:3200',
    ...devices['Desktop Chrome'],
  },
  webServer: [
    {
      command: 'node tests/e2e/api-fixture.mjs',
      url: 'http://127.0.0.1:5300/health',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      name: 'Fixture API',
    },
    {
      command: 'npm run dev -- --hostname 127.0.0.1 --port 3200',
      url: 'http://127.0.0.1:3200/tracks',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        API_URL: process.env.API_URL ?? 'http://127.0.0.1:5300',
        APP_ORIGIN: 'http://127.0.0.1:3200',
        NEXT_DIST_DIR: process.env.NEXT_DIST_DIR ?? '.next-e2e',
      },
      name: 'Next client',
    },
  ],
})
