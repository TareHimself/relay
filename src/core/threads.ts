import { threadFileSchema, type Anchor, type Thread, type ThreadStatus } from '../shared/threads'
import { commonPrefixLength, commonSuffixLength } from '../shared/anchors'
import { locateUnique } from './edits'
import { StoreError } from './errors'
import { newId } from './ids'

const CONTEXT_LENGTH = 32

export type { Anchor, Thread, ThreadStatus }

export function threadsPathFor(pagePath: string): string {
  return pagePath.replace(/\.md$/, '.threads.json')
}

export function parseThreads(raw: string | null): Thread[] {
  if (raw === null) return []
  try {
    return threadFileSchema.parse(JSON.parse(raw)).threads
  } catch {
    throw new StoreError('invalid', 'Thread file is malformed')
  }
}

export function serializeThreads(threads: readonly Thread[]): string {
  return `${JSON.stringify({ threads }, null, 2)}\n`
}

export function mentionsIn(body: string): string[] {
  const handles = Array.from(body.matchAll(/(?<![\w@])@([a-z0-9][\w-]*)/gi), (m) =>
    (m[1] ?? '').toLowerCase(),
  )
  return [...new Set(handles)]
}

export interface AnchorContext {
  prefix: string
  suffix: string
}

function locateWithContext(markdown: string, exact: string, context: AnchorContext): number {
  const offsets: number[] = []
  for (let at = markdown.indexOf(exact); at >= 0 && exact; at = markdown.indexOf(exact, at + 1))
    offsets.push(at)
  if (offsets.length < 2) return locateUnique(markdown, exact)
  const scored = offsets
    .map((offset) => ({
      offset,
      score:
        commonSuffixLength(markdown.slice(0, offset), context.prefix) +
        commonPrefixLength(markdown.slice(offset + exact.length), context.suffix),
    }))
    .sort((a, b) => b.score - a.score)
  if (scored[0]?.score === scored[1]?.score) return locateUnique(markdown, exact)
  return scored[0]?.offset ?? locateUnique(markdown, exact)
}

export function anchorFor(markdown: string, exact: string, context?: AnchorContext): Anchor {
  const offset = context
    ? locateWithContext(markdown, exact, context)
    : locateUnique(markdown, exact)
  return {
    exact,
    prefix: markdown.slice(Math.max(0, offset - CONTEXT_LENGTH), offset),
    suffix: markdown.slice(offset + exact.length, offset + exact.length + CONTEXT_LENGTH),
    offset,
  }
}

interface NewThread {
  anchor?: Anchor | undefined
  author: string
  body: string
  to?: readonly string[] | undefined
  at: string
}

export function startThread(input: NewThread): Thread {
  const to = [
    ...new Set([...(input.to ?? []).map((h) => h.toLowerCase()), ...mentionsIn(input.body)]),
  ]
  const thread: Thread = {
    id: newId(),
    status: 'open',
    to,
    messages: [{ id: newId(), author: input.author, body: input.body, at: input.at }],
  }
  if (input.anchor) thread.anchor = input.anchor
  return thread
}

export function addMessage(
  thread: Thread,
  author: string,
  body: string,
  at: string,
): { thread: Thread; addressed: string[] } {
  const addressed = mentionsIn(body).filter((handle) => !thread.to.includes(handle))
  const answered = thread.to.includes(author.toLowerCase())
  return {
    thread: {
      ...thread,
      status: answered ? 'answered' : 'open',
      to: [...thread.to, ...addressed],
      messages: [...thread.messages, { id: newId(), author, body, at }],
    },
    addressed,
  }
}

export function editMessage(
  thread: Thread,
  messageId: string,
  author: string,
  body: string,
  at: string,
): { thread: Thread; addressed: string[] } {
  const message = thread.messages.find((m) => m.id === messageId)
  if (!message) throw new StoreError('not_found', 'Message not found')
  if (message.author !== author)
    throw new StoreError('forbidden', 'Only the author can edit a message')
  if (message.body === body) return { thread, addressed: [] }
  const addressed = mentionsIn(body).filter((handle) => !thread.to.includes(handle))
  return {
    thread: {
      ...thread,
      to: [...thread.to, ...addressed],
      messages: thread.messages.map((m) => (m.id === messageId ? { ...m, body, editedAt: at } : m)),
    },
    addressed,
  }
}

export function removeMessage(thread: Thread, messageId: string, author: string): Thread | null {
  const index = thread.messages.findIndex((m) => m.id === messageId)
  const message = thread.messages[index]
  if (!message) throw new StoreError('not_found', 'Message not found')
  if (message.author !== author)
    throw new StoreError('forbidden', 'Only the author can delete a message')
  if (index === 0) return null
  return { ...thread, messages: thread.messages.filter((m) => m.id !== messageId) }
}
