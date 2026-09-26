import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp } from './http/app'
import { RelayStore } from './store/relay-store'

const directories: string[] = []
const stores: RelayStore[] = []

export async function tempStore(): Promise<RelayStore> {
  const directory = await fs.mkdtemp(join(tmpdir(), 'relay-test-'))
  directories.push(directory)
  const store = await RelayStore.open(directory)
  stores.push(store)
  return store
}

export async function cleanupStores(): Promise<void> {
  for (const store of stores.splice(0)) store.close()
  for (const directory of directories.splice(0)) {
    await fs.rm(directory, { recursive: true, force: true })
  }
}

function clientWith(store: RelayStore, extra: Record<string, string>) {
  const app = createApp(store)
  const headers: Record<string, string> = { 'content-type': 'application/json', ...extra }
  return {
    get: (path: string) => app.request(path, { headers }),
    send: (method: string, path: string, body?: unknown) =>
      app.request(path, {
        method,
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
  }
}

export function client(store: RelayStore, token?: string) {
  return clientWith(store, token ? { authorization: `Bearer ${token}` } : {})
}

export async function adminClient(store: RelayStore, handle = 'tare') {
  if (!store.accounts.hasAdmin()) {
    await store.accounts.bootstrapAdmin({ handle, password: 'test password!' })
  }
  const login = await store.accounts.login('test password!', 'test')
  return clientWith(store, { cookie: `relay_session=${login?.secret}` })
}

export async function json<T = any>(response: Response): Promise<T> {
  return (await response.json()) as T
}
