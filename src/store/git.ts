import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const exec = promisify(execFile)

export const AUTOSAVE_IDLE_SECONDS = 180
export const AUTOSAVE_MAX_SECONDS = 1800

export class Git {
  constructor(readonly dir: string) {}

  async run(args: string[], env: NodeJS.ProcessEnv = {}): Promise<string> {
    const { stdout } = await exec('git', ['-C', this.dir, ...args], {
      env: { ...process.env, ...env, GIT_TERMINAL_PROMPT: '0' },
      maxBuffer: 1024 * 1024,
    })
    return stdout.trim()
  }

  async raw(args: string[]): Promise<string> {
    const { stdout } = await exec('git', ['-C', this.dir, ...args], {
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      maxBuffer: 32 * 1024 * 1024,
    })
    return stdout
  }

  async hasStagedChanges(): Promise<boolean> {
    try {
      await this.run(['diff', '--cached', '--quiet'])
      return false
    } catch {
      return true
    }
  }

  stagedTree(): Promise<string> {
    return this.run(['write-tree'])
  }

  treeOf(revision: string): Promise<string> {
    return this.run(['rev-parse', `${revision}^{tree}`])
  }

  async commitsTouching(path: string): Promise<string[]> {
    return (await this.run(['log', '--format=%H', '--', path])).split('\n')
  }

  show(hash: string, path: string): Promise<string> {
    return this.raw(['show', `${hash}:${path}`])
  }

  async autosaveHead(
    path: string,
    email: string,
    nowSeconds: number,
  ): Promise<{ hash: string; message: string } | null> {
    const head = await this.run([
      'log',
      '-1',
      '--format=%H%x09%P%x09%ae%x09%at%x09%ct%x09%s',
      'HEAD',
    ]).catch(() => '')
    const [hash = '', parents = '', headEmail = '', authored = '0', committed = '0', subject = ''] =
      head.split('\t')
    if (
      !hash ||
      !parents ||
      parents.includes(' ') ||
      headEmail !== email ||
      !subject.startsWith(`edit: ${path} (`) ||
      nowSeconds - Number(committed) > AUTOSAVE_IDLE_SECONDS ||
      nowSeconds - Number(authored) > AUTOSAVE_MAX_SECONDS
    ) {
      return null
    }
    const files = await this.run(['diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD'])
    if (files !== path) return null
    return { hash, message: (await this.run(['log', '-1', '--format=%B', 'HEAD'])).trimEnd() }
  }
}
