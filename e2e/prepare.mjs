import { execFileSync } from 'node:child_process'
import { rmSync } from 'node:fs'

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const run = (command, args) =>
  execFileSync(command, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' })

rmSync('.e2e', { recursive: true, force: true })
run('pnpm', [
  'exec',
  'esbuild',
  'src/index.ts',
  '--bundle',
  '--platform=node',
  '--format=esm',
  '--target=node22',
  '--packages=external',
  '--outfile=.e2e/dist/index.js',
])
run('pnpm', [
  '--dir',
  'web',
  'exec',
  'vite',
  'build',
  '--outDir',
  '../.e2e/web/dist',
  '--emptyOutDir',
])
