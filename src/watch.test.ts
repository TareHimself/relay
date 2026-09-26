import { serve } from '@hono/node-server'
import { createServer, type AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp } from './http/app'
import { cleanupStores, tempStore } from './test-support'
import { watch } from './watch'

afterEach(cleanupStores)

async function freePort(): Promise<number> {
  const probe = createServer()
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve))
  const { port } = probe.address() as AddressInfo
  await new Promise((resolve) => probe.close(resolve))
  return port
}

async function until(condition: () => boolean, message: string): Promise<void> {
  for (let i = 0; i < 100; i += 1) {
    if (condition()) return
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error(`Timed out waiting for ${message}`)
}

async function setup() {
  const store = await tempStore()
  const port = await freePort()
  const server = serve({ fetch: createApp(store).fetch, port, hostname: '127.0.0.1' })
  const project = await store.createProject('Alpha', '', 'tare')
  const page = await store.createPage(project.id, 'Plan', 'Ship the store today', 'tare')
  const { token } = store.tokens.create({ name: 'bot', scope: 'write' })
  const lines: string[] = []
  const controller = new AbortController()
  const start = (everything = false) =>
    watch({
      url: `http://127.0.0.1:${port}`,
      token,
      everything,
      out: (line) => lines.push(line),
      err: () => undefined,
      signal: controller.signal,
      retryMs: 20,
    })
  const listeners = () => (store as unknown as { listeners: Set<unknown> }).listeners.size
  const stop = async (running: Promise<void>) => {
    controller.abort()
    await running.catch(() => undefined)
    server.close()
  }
  return { store, page, token, lines, start, listeners, stop, port }
}

describe('watch', () => {
  it('reports threads already waiting for the token, then new comments to it as they happen', async () => {
    const { store, page, lines, start, listeners, stop } = await setup()
    await store.threads.create(page.id, '@bot please review', { anchorText: 'Ship' }, 'tare')

    const running = start()
    await until(() => lines.length === 1 && listeners() > 0, 'the pending thread')
    expect(lines[0]).toMatch(
      /^\[relay\] pending: tare wrote to @bot on thread \w{32}: @bot please review$/,
    )

    const thread = await store.threads.create(
      page.id,
      'and @bot this too',
      { anchorText: 'store' },
      'tare',
    )
    await until(() => lines.length === 2, 'the mention')
    expect(lines[1]).toBe(
      `[relay] tare wrote to @bot on thread ${thread.id} (page ${page.id}): and @bot this too`,
    )
    await stop(running)
  })

  it('ignores comments that are not for it and its own replies', async () => {
    const { store, page, lines, start, listeners, stop } = await setup()
    const thread = await store.threads.create(
      page.id,
      'no mention here',
      { anchorText: 'Ship' },
      'tare',
    )
    const running = start()
    await until(() => listeners() > 0, 'the stream')

    await store.threads.reply(thread.id, 'still nobody', 'tare')
    await store.threads.reply(thread.id, 'pinging @someone-else', 'tare')
    await store.threads.reply(thread.id, 'thanks @bot', 'bot')
    await store.threads.reply(thread.id, 'a follow-up with no mention', 'tare')
    await until(() => lines.length === 1, 'the follow-up')
    expect(lines[0]).toContain('a follow-up with no mention')
    await stop(running)
  })

  it('reports every change by others when asked for everything', async () => {
    const { store, page, lines, start, listeners, stop } = await setup()
    const running = start(true)
    await until(() => listeners() > 0, 'the stream')
    await store.editPage(
      page.id,
      { edits: [{ find: 'today', replace: 'soon' }] },
      undefined,
      'tare',
    )
    await store.editPage(page.id, { edits: [{ find: 'soon', replace: 'later' }] }, undefined, 'bot')
    await until(() => lines.length === 1, 'the edit')
    expect(lines[0]).toMatch(/^\[relay\] page\.updated by tare \(page \w{32}\)/)
    await stop(running)
  })

  it('refuses a rejected token and a session-style login', async () => {
    const { port, lines } = await setup()
    await expect(
      watch({
        url: `http://127.0.0.1:${port}`,
        token: 'rly_wrong',
        everything: false,
        out: (line) => lines.push(line),
        err: () => undefined,
      }),
    ).rejects.toThrow(/rejected/)
  })
})
