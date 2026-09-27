import { and, eq } from 'drizzle-orm'
import * as schema from '../db/schema'
import type { Orm } from '../db/orm'
import { StoreError } from '../core/errors'
import {
  addMessage,
  anchorFor,
  editMessage as applyMessageEdit,
  parseThreads,
  removeMessage,
  serializeThreads,
  startThread,
  threadsPathFor,
  type AnchorContext,
  type Thread,
  type ThreadStatus,
} from '../core/threads'
import type { StoredPage, StoredPageSummary, StoreEvent } from '../shared/pages'
import { excerpt, newEvent } from './events'

export interface PageThread extends Thread {
  pageId: string
  projectId: string
}

export interface ThreadHost {
  orm: Orm
  serial: <T>(work: () => Promise<T>) => Promise<T>
  readFile: (path: string) => Promise<string | null>
  commit: (
    path: string,
    expected: string | null,
    content: string,
    actor: string,
    events: StoreEvent[],
  ) => Promise<void>
  pageRow: (id: string) => StoredPageSummary
  readPage: (id: string) => Promise<StoredPage>
  allPages: () => StoredPageSummary[]
  indexed: (page: StoredPageSummary, threads: Thread[]) => void
}

interface ThreadFilter {
  projectId?: string | undefined
  to?: string | undefined
  status?: ThreadStatus | undefined
}

export class ThreadService {
  constructor(private readonly host: ThreadHost) {}

  projectIdOf(threadId: string): string {
    return this.pageOf(threadId).projectId
  }

  async listForPage(pageId: string): Promise<Thread[]> {
    return (await this.load(this.host.pageRow(pageId))).threads
  }

  async list(filter: ThreadFilter = {}): Promise<PageThread[]> {
    const rows = this.host.orm
      .select()
      .from(schema.threads)
      .where(
        and(
          eq(schema.threads.status, filter.status ?? 'open'),
          filter.projectId ? eq(schema.threads.projectId, filter.projectId) : undefined,
        ),
      )
      .orderBy(schema.threads.id)
      .all()
    const to = filter.to?.toLowerCase()
    const result: PageThread[] = []
    for (const pageId of new Set(rows.map((row) => row.pageId))) {
      const page = this.host.pageRow(pageId)
      const ids = new Set(rows.filter((row) => row.pageId === pageId).map((row) => row.id))
      const { threads } = await this.load(page)
      for (const thread of threads) {
        if (!ids.has(thread.id) || (to && !thread.to.includes(to))) continue
        result.push({ ...thread, pageId, projectId: page.projectId })
      }
    }
    return result.sort((a, b) => a.id.localeCompare(b.id))
  }

  create(
    pageId: string,
    body: string,
    options: { anchorText?: string; context?: AnchorContext; to?: string[] },
    actor: string,
  ): Promise<Thread> {
    return this.host.serial(async () => {
      const page = await this.host.readPage(pageId)
      const { raw, threads } = await this.load(page)
      const thread = startThread({
        anchor:
          options.anchorText === undefined
            ? undefined
            : anchorFor(page.body, options.anchorText, options.context),
        author: actor,
        body,
        to: options.to,
        at: new Date().toISOString(),
      })
      const events = [
        newEvent('comment.created', actor, page.projectId, {
          pageId,
          threadId: thread.id,
          summary: excerpt(body),
        }),
        ...this.addressed(thread.to, actor, page, thread.id, body),
      ]
      await this.save(page, raw, [...threads, thread], actor, events)
      return thread
    })
  }

  reply(threadId: string, body: string, actor: string): Promise<Thread> {
    return this.update(threadId, actor, (current, page) => {
      const { thread, addressed } = addMessage(current, actor, body, new Date().toISOString())
      const recipients = [...new Set([...addressed, ...current.to])].filter(
        (handle) => handle.toLowerCase() !== actor.toLowerCase(),
      )
      return {
        thread,
        events: [
          newEvent('comment.replied', actor, page.projectId, {
            pageId: page.id,
            threadId,
            summary: excerpt(body),
          }),
          ...this.addressed(recipients, actor, page, threadId, body),
        ],
      }
    })
  }

  editMessage(threadId: string, messageId: string, body: string, actor: string): Promise<Thread> {
    return this.update(threadId, actor, (current, page) => {
      const { thread, addressed } = applyMessageEdit(
        current,
        messageId,
        actor,
        body,
        new Date().toISOString(),
      )
      if (thread === current) return { thread, events: [] }
      return {
        thread,
        events: [
          newEvent('comment.edited', actor, page.projectId, {
            pageId: page.id,
            threadId,
            summary: excerpt(body),
          }),
          ...this.addressed(addressed, actor, page, threadId, body),
        ],
      }
    })
  }

  deleteMessage(
    threadId: string,
    messageId: string,
    actor: string,
  ): Promise<{ threadRemoved: boolean }> {
    return this.host.serial(async () => {
      const page = this.pageOf(threadId)
      const { raw, threads } = await this.load(page)
      const current = threads.find((t) => t.id === threadId)
      if (!current) throw new StoreError('not_found', 'Thread not found')
      const remaining = removeMessage(current, messageId, actor)
      const next = remaining
        ? threads.map((t) => (t.id === threadId ? remaining : t))
        : threads.filter((t) => t.id !== threadId)
      const event = newEvent('comment.deleted', actor, page.projectId, {
        pageId: page.id,
        threadId,
      })
      await this.save(page, raw, next, actor, [event])
      return { threadRemoved: remaining === null }
    })
  }

  reopen(threadId: string, actor: string): Promise<Thread> {
    return this.update(threadId, actor, (current, page) => {
      if (current.status !== 'resolved') return { thread: current, events: [] }
      return {
        thread: { ...current, status: 'open' },
        events: [
          newEvent('comment.reopened', actor, page.projectId, { pageId: page.id, threadId }),
        ],
      }
    })
  }

  resolve(threadId: string, actor: string): Promise<Thread> {
    return this.update(threadId, actor, (current, page) => {
      if (current.status === 'resolved') return { thread: current, events: [] }
      return {
        thread: { ...current, status: 'resolved' },
        events: [
          newEvent('comment.resolved', actor, page.projectId, { pageId: page.id, threadId }),
        ],
      }
    })
  }

  adoptAuthor(from: string, to: string): Promise<number> {
    return this.host.serial(async () => {
      let files = 0
      for (const page of this.host.allPages()) {
        const { raw, threads } = await this.load(page)
        if (!threads.some((thread) => thread.messages.some((m) => m.author === from))) continue
        const rewritten = threads.map((thread) => ({
          ...thread,
          messages: thread.messages.map((m) => (m.author === from ? { ...m, author: to } : m)),
        }))
        await this.save(page, raw, rewritten, to, [])
        files += 1
      }
      return files
    })
  }

  private async load(page: StoredPageSummary): Promise<{ raw: string | null; threads: Thread[] }> {
    const raw = await this.host.readFile(threadsPathFor(page.path))
    return { raw, threads: parseThreads(raw) }
  }

  private async save(
    page: StoredPageSummary,
    raw: string | null,
    threads: Thread[],
    actor: string,
    events: StoreEvent[],
  ): Promise<void> {
    await this.host.commit(threadsPathFor(page.path), raw, serializeThreads(threads), actor, events)
    this.host.orm.transaction((tx) => {
      tx.delete(schema.threads).where(eq(schema.threads.pageId, page.id)).run()
      for (const t of threads) {
        tx.insert(schema.threads)
          .values({ id: t.id, pageId: page.id, projectId: page.projectId, status: t.status })
          .run()
      }
    })
    this.host.indexed(page, threads)
  }

  private addressed(
    handles: readonly string[],
    actor: string,
    page: StoredPageSummary,
    threadId: string,
    body: string,
  ): StoreEvent[] {
    return handles.map((handle) =>
      newEvent('comment.addressed', actor, page.projectId, {
        pageId: page.id,
        threadId,
        summary: `@${handle}: ${excerpt(body)}`,
      }),
    )
  }

  private pageOf(threadId: string): StoredPageSummary {
    const row = this.host.orm
      .select()
      .from(schema.threads)
      .where(eq(schema.threads.id, threadId))
      .get()
    if (!row) throw new StoreError('not_found', 'Thread not found')
    return this.host.pageRow(row.pageId)
  }

  private update(
    threadId: string,
    actor: string,
    change: (thread: Thread, page: StoredPageSummary) => { thread: Thread; events: StoreEvent[] },
  ): Promise<Thread> {
    return this.host.serial(async () => {
      const page = this.pageOf(threadId)
      const { raw, threads } = await this.load(page)
      const current = threads.find((t) => t.id === threadId)
      if (!current) throw new StoreError('not_found', 'Thread not found')
      const { thread, events } = change(current, page)
      if (events.length === 0) return current
      await this.save(
        page,
        raw,
        threads.map((t) => (t.id === threadId ? thread : t)),
        actor,
        events,
      )
      return thread
    })
  }
}
