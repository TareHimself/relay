import { defineConfig } from '@playwright/test'

const PORT = 47998
export const ADMIN = { handle: 'tare', password: 'e2e-password-123456' }

export default defineConfig({
  testDir: 'e2e',
  testMatch: '*.spec.ts',
  workers: 1,
  fullyParallel: false,
  timeout: 30_000,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    viewport: { width: 1280, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node .e2e/dist/index.js',
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
    env: {
      PORT: String(PORT),
      DATA_DIR: `.e2e/data-${Date.now()}`,
      ADMIN_HANDLE: ADMIN.handle,
      ADMIN_PASSWORD: ADMIN.password,
    },
  },
})
