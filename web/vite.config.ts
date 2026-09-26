import react from '@vitejs/plugin-react'
import wyw from '@wyw-in-js/vite'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    wyw({
      include: ['**/*.{ts,tsx}'],
      exclude: ['**/node_modules/**', '**/shared/**'],
    }),
    react(),
  ],
  resolve: {
    alias: { '@shared': fileURLToPath(new URL('../src/shared', import.meta.url)) },
  },
  server: { fs: { allow: ['..'] }, proxy: { '/api': 'http://127.0.0.1:47821' } },
})
