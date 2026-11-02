import { and, eq, inArray, isNull } from 'drizzle-orm'
import * as schema from '../db/schema'
import type { Orm } from '../db/orm'
import { StoreError } from '../core/errors'
import {
  addMessage,
  anchorFor,
  editMessage as applyMessageEdit,
  removeMessage,
  startThread,
  type AnchorContext,
  type Thread,
  type ThreadStatus,
} from '../core/threads'
import type { Page, PageSummary, StoreEvent } from '../shared/pages'
import type { Message } from '../shared/threads'
import { excerpt, newEvent } from './events'

export interface PageThread extends Thread {
  pageId: string
  projectId: string
}

export interface ThreadHost {
  orm: Orm
  pageRow: (id: string) => PageSummary
  readPage: (id: string) => Page
  write: <T>(work: (emit: (event: StoreEvent) => void) => T) => T
  now: () => string
}

interface ThreadFilter {
  projectId?: string | undefined
  to?: string | undefined
  status?: ThreadStatus | undefined
}

type ThreadRow = typeof schema.threads.$inferSelect
type MessageRow = typeof schema.messages.$inferSelect

const MAX_ANCHOR = 2000
const MAX_CONTEXT = 200

function threadOf(row: ThreadRow, messages: readonly MessageRow[]): Thread {
  const thread: Thread = {
    id: row.id,
    status: row.status,
    to: row.recipients,
    messages: messages.map((m) => ({
      id: m.id,
      author: m.author,
      body: m.body,
      at: m.at,
      ...(m.editedAt ? { editedAt: m.editedAt } : {}),
    })),
  }
  if (row.anchorExact !== null && row.anchorOffset !== null) {
    thread.anchor = {
      exact: row.anchorExact,
      prefix: row.anchorPrefix ?? '',
      suffix: row.anchorSuffix ?? '',
      offset: row.anchorOffset,
    }
  }
  return thread
}

export class ThreadService {
  constructor(private readonly host: ThreadHost) {}

  projectIdOf(threadId: string): string {
    return this.host.pageRow(this.row(threadId).pageId).projectId
  }

  listForPage(pageId: string): Thread[] {
    this.host.pageRow(pageId)
    const rows = this.host.orm
      .select()
      .from(schema.threads)
      .where(eq(schema.threads.pageId, pageId))
      .orderBy(schema.threads.id)
      .all()
    return this.attach(rows)
  }

  list(filter: ThreadFilter = {}): PageThread[] {
    const rows = this.host.orm
      .select({ thread: schema.threads })
      .from(schema.threads)
      .innerJoin(schema.pages, eq(schema.pages.id, schema.threads.pageId))
      .where(
        and(
          isNull(schema.pages.deletedAt),
          eq(schema.threads.status, filter.status ?? 'open'),
          filter.projectId ? eq(schema.threads.projectId, filter.projectId) : undefined,
        ),
      )
      .orderBy(schema.threads.id)
      .all()
      .map((row) => row.thread)
    const to = filter.to?.toLowerCase()
    const wanted = to ? rows.filter((row) => row.recipients.includes(to)) : rows
    const threads = this.attach(wanted)
    return threads.map((thread, index) => ({
      ...thread,
      pageId: wanted[index]!.pageId,
      projectId: wanted[index]!.projectId,
    }))
  }

  create(
    pageId: string,
    body: string,
    options: { anchorText?: string; context?: AnchorContext; to?: string[] },
    actor: string,
  ): Thread {
    if (options.anchorText !== undefined && options.anchorText.length > MAX_ANCHOR) {
      throw new StoreError('invalid', `anchorText is longer than ${MAX_ANCHOR} characters`)
    }
    if (
      options.context &&
      (options.context.prefix.length > MAX_CONTEXT || options.context.suffix.length > MAX_CONTEXT)
    ) {
      throw new StoreError('invalid', `context is longer than ${MAX_CONTEXT} characters`)
    }
    return this.host.write((emit) => {
      const page = this.host.readPage(pageId)
      const thread = startThread({
        anchor:
          options.anchorText === undefined
            ? undefined
            : anchorFor(page.body, options.anchorText, options.context),
        author: actor,
        body,
        to: options.to,
        at: this.host.now(),
      })
      this.host.orm
        .insert(schema.threads)
        .values({
          id: thread.id,
          pageId: page.id,
          projectId: page.projectId,
          status: thread.status,
          anchorExact: thread.anchor?.exact ?? null,
          anchorPrefix: thread.anchor?.prefix ?? null,
          anchorSuffix: thread.anchor?.suffix ?? null,
          anchorOffset: thread.anchor?.offset ?? null,
          recipients: thread.to,
          createdAt: this.host.now(),
        })
        .run()
      this.saveMessages(thread.id, [], thread.messages)
      emit(
        newEvent('comment.created', actor, page.projectId, {
          pageId,
          threadId: thread.id,
          summary: excerpt(body),
        }),
      )
      for (const event of this.addressed(thread.to, actor, page, thread.id, body)) emit(event)
      return thread
    })
  }

  reply(threadId: string, body: string, actor: string): Thread {
    return this.update(threadId, (current, page) => {
      const { thread, addressed } = addMessage(current, actor, body, this.host.now())
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

  editMessage(threadId: string, messageId: string, body: string, actor: string): Thread {
    return this.update(threadId, (current, page) => {
      const { thread, addressed } = applyMessageEdit(
        current,
        messageId,
        actor,
        body,
        this.host.now(),
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

  deleteMessage(threadId: string, messageId: string, actor: string): { threadRemoved: boolean } {
    return this.host.write((emit) => {
      const row = this.row(threadId)
      const page = this.host.pageRow(row.pageId)
      const current = this.attach([row])[0]!
      const remaining = removeMessage(current, messageId, actor)
      if (remaining) this.saveThread(remaining, current)
      else this.host.orm.delete(schema.threads).where(eq(schema.threads.id, threadId)).run()
      if (!remaining) {
        this.host.orm.delete(schema.messages).where(eq(schema.messages.threadId, threadId)).run()
      }
      emit(newEvent('comment.deleted', actor, page.projectId, { pageId: page.id, threadId }))
      return { threadRemoved: remaining === null }
    })
  }

  reopen(threadId: string, actor: string): Thread {
    return this.update(threadId, (current, page) => {
      if (current.status !== 'resolved') return { thread: current, events: [] }
      return {
        thread: { ...current, status: 'open' },
        events: [
          newEvent('comment.reopened', actor, page.projectId, { pageId: page.id, threadId }),
        ],
      }
    })
  }

  resolve(threadId: string, actor: string): Thread {
    return this.update(threadId, (current, page) => {
      if (current.status === 'resolved') return { thread: current, events: [] }
      return {
        thread: { ...current, status: 'resolved' },
        events: [
          newEvent('comment.resolved', actor, page.projectId, { pageId: page.id, threadId }),
        ],
      }
    })
  }

  private row(threadId: string): ThreadRow {
    const row = this.host.orm
      .select()
      .from(schema.threads)
      .where(eq(schema.threads.id, threadId))
      .get()
    if (!row) throw new StoreError('not_found', 'Thread not found')
    return row
  }

  private attach(rows: readonly ThreadRow[]): Thread[] {
    if (rows.length === 0) return []
    const messages = this.host.orm
      .select()
      .from(schema.messages)
      .where(
        inArray(
          schema.messages.threadId,
          rows.map((row) => row.id),
        ),
      )
      .orderBy(schema.messages.at, schema.messages.id)
      .all()
    return rows.map((row) =>
      threadOf(
        row,
        messages.filter((m) => m.threadId === row.id),
      ),
    )
  }

  private saveMessages(
    threadId: string,
    before: readonly Message[],
    after: readonly Message[],
  ): void {
    const keep = new Set(after.map((m) => m.id))
    const gone = before.filter((m) => !keep.has(m.id)).map((m) => m.id)
    if (gone.length) {
      this.host.orm.delete(schema.messages).where(inArray(schema.messages.id, gone)).run()
    }
    const known = new Map(before.map((m) => [m.id, m]))
    for (const message of after) {
      const previous = known.get(message.id)
      const row = {
        id: message.id,
        threadId,
        author: message.author,
        body: message.body,
        at: message.at,
        editedAt: message.editedAt ?? null,
      }
      if (!previous) this.host.orm.insert(schema.messages).values(row).run()
      else if (previous.body !== message.body || previous.editedAt !== message.editedAt) {
        this.host.orm
          .update(schema.messages)
          .set(row)
          .where(eq(schema.messages.id, message.id))
          .run()
      }
    }
  }

  private saveThread(next: Thread, before: Thread): void {
    if (next.status !== before.status || next.to.join('\n') !== before.to.join('\n')) {
      this.host.orm
        .update(schema.threads)
        .set({ status: next.status, recipients: next.to })
        .where(eq(schema.threads.id, next.id))
        .run()
    }
    this.saveMessages(next.id, before.messages, next.messages)
  }

  private addressed(
    handles: readonly string[],
    actor: string,
    page: PageSummary,
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

  private update(
    threadId: string,
    change: (thread: Thread, page: PageSummary) => { thread: Thread; events: StoreEvent[] },
  ): Thread {
    return this.host.write((emit) => {
      const row = this.row(threadId)
      const page = this.host.pageRow(row.pageId)
      const current = this.attach([row])[0]!
      const { thread, events } = change(current, page)
      if (events.length === 0) return current
      this.saveThread(thread, current)
      for (const event of events) emit(event)
      return thread
    })
  }
}
