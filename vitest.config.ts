import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { testTimeout: 30_000, exclude: ['e2e/**', '.e2e/**', '**/node_modules/**', '**/dist/**'] },
  resolve: {
    alias: { '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)) },
  },
})
