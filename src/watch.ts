import type { StoreEvent } from './shared/pages'
import type { Whoami } from './shared/accounts'
import type { Thread } from './shared/threads'

export interface WatchOptions {
  url: string
  token: string
  everything: boolean
  out: (line: string) => void
  err: (line: string) => void
  signal?: AbortSignal | undefined
  retryMs?: number
}

const MAX_RETRY_MS = 30_000
const EXCERPT = 160

function excerpt(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > EXCERPT ? `${flat.slice(0, EXCERPT - 1)}…` : flat
}

function isForHandle(event: StoreEvent, handle: string): boolean {
  return event.type === 'comment.addressed' && (event.summary ?? '').startsWith(`@${handle}:`)
}

function describeEvent(event: StoreEvent, handle: string, everything: boolean): string | null {
  if (event.actor === handle) return null
  if (isForHandle(event, handle)) {
    const body = (event.summary ?? '').slice(handle.length + 3)
    return `[relay] ${event.actor} wrote to @${handle} on thread ${event.threadId} (page ${event.pageId}): ${body}`
  }
  if (!everything) return null
  const where = [
    event.pageId && `page ${event.pageId}`,
    event.threadId && `thread ${event.threadId}`,
  ]
    .filter(Boolean)
    .join(', ')
  return `[relay] ${event.type} by ${event.actor}${where ? ` (${where})` : ''}${event.summary ? `: ${event.summary}` : ''}`
}

function describePending(thread: Thread, handle: string): string | null {
  const last = thread.messages.at(-1)
  if (!last || last.author === handle) return null
  return `[relay] pending: ${last.author} wrote to @${handle} on thread ${thread.id}: ${excerpt(last.body)}`
}

class Api {
  constructor(
    private readonly base: string,
    private readonly token: string,
  ) {}

  async get<T>(path: string, signal?: AbortSignal): Promise<T> {
    const response = await this.request(path, {}, signal)
    return (await response.json()) as T
  }

  request(path: string, headers: Record<string, string>, signal?: AbortSignal): Promise<Response> {
    return fetch(`${this.base}/api${path}`, {
      headers: { authorization: `Bearer ${this.token}`, ...headers },
      ...(signal ? { signal } : {}),
    }).then((response) => {
      if (response.status === 401) throw new Error('The token was rejected (401)')
      if (!response.ok) throw new Error(`Request failed (${response.status})`)
      return response
    })
  }
}

async function* frames(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<{ event: string; data: string; id: string }> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) return
    buffer += decoder.decode(value, { stream: true })
    let end: number
    while ((end = buffer.indexOf('\n\n')) !== -1) {
      const raw = buffer.slice(0, end)
      buffer = buffer.slice(end + 2)
      const field = (name: string) =>
        raw
          .split('\n')
          .filter((line) => line.startsWith(`${name}:`))
          .map((line) => line.slice(name.length + 1).trimStart())
          .join('\n')
      yield { event: field('event') || 'message', data: field('data'), id: field('id') }
    }
  }
}

export async function watch(options: WatchOptions): Promise<void> {
  const { out, err, signal, everything } = options
  const api = new Api(options.url.replace(/\/+$/, ''), options.token)
  const me = await api.get<Whoami>('/whoami', signal)
  if (me.kind !== 'token') throw new Error('Use an API token, not a signed-in session')
  const handle = me.handle
  err(`Watching ${options.url} as @${handle}${everything ? ' (all events)' : ''}`)

  const seen = new Set<string>()
  const startedAt = new Date().toISOString()
  let lastId: string | null = null
  const emit = (event: StoreEvent) => {
    if (seen.has(event.id)) return
    seen.add(event.id)
    if (lastId === null || event.id > lastId) lastId = event.id
    const line = describeEvent(event, handle, everything)
    if (line) out(line)
  }

  const pending = await api.get<Thread[]>(
    `/threads?to=${encodeURIComponent(handle)}&status=open`,
    signal,
  )
  for (const thread of pending) {
    const line = describePending(thread, handle)
    if (line) out(line)
  }
  let delay = options.retryMs ?? 1000
  let connected = false
  while (!signal?.aborted) {
    try {
      if (connected) {
        const missed = await api.get<{ events: StoreEvent[] }>(
          `/events?since=${encodeURIComponent(lastId ?? startedAt)}&limit=500`,
          signal,
        )
        for (const event of missed.events) emit(event)
      }
      const response = await api.request('/stream', { accept: 'text/event-stream' }, signal)
      connected = true
      delay = options.retryMs ?? 1000
      for await (const frame of frames(response.body!)) {
        if (frame.event === 'store' && frame.data) emit(JSON.parse(frame.data) as StoreEvent)
      }
      err('Stream closed, reconnecting')
    } catch (error) {
      if (signal?.aborted) return
      const message = error instanceof Error ? error.message : String(error)
      if (message.includes('rejected')) throw error
      err(`Connection lost (${message}), retrying in ${Math.round(delay / 1000)}s`)
    }
    await new Promise((resolve) => setTimeout(resolve, delay))
    delay = Math.min(delay * 2, MAX_RETRY_MS)
  }
}
