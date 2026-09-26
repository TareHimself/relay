import { runCli, type CliIo } from './cli'
import { startServer } from './server'

function readSecret(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const { stdin, stdout } = process
    stdout.write(prompt)
    stdin.setRawMode(true)
    stdin.resume()
    stdin.setEncoding('utf8')
    let value = ''
    const finish = (error?: Error) => {
      stdin.off('data', onData)
      stdin.setRawMode(false)
      stdin.pause()
      stdout.write('\n')
      if (error) reject(error)
      else resolve(value)
    }
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n') return finish()
        if (char === '\u0003') return finish(new Error('Cancelled'))
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1)
        else value += char
      }
    }
    stdin.on('data', onData)
  })
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString('utf8')
}

const io: CliIo = {
  isTTY: process.stdin.isTTY,
  readSecret,
  readStdin,
  out: (line) => console.log(line),
  err: (line) => console.error(line),
}

const [command = 'serve', ...args] = process.argv.slice(2)
if (command === 'serve') {
  await startServer().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
} else {
  const stop = new AbortController()
  for (const name of ['SIGINT', 'SIGTERM'] as const) process.on(name, () => stop.abort())
  process.exit(await runCli([command, ...args], io, process.env, stop.signal))
}
