import type { Access } from './auth/access'
import type { Person, SessionRecord, Whoami } from './shared/accounts'
import { StoreError } from './core/errors'
import { outlineOf } from './core/sections'
import type {
  OutlineEntry,
  Page,
  PageStatus,
  PageSummary,
  Project,
  StoreEvent,
} from './shared/pages'
import type { Thread, ThreadStatus } from './shared/threads'
import { searchKindSchema, type SearchHit, type SearchKind } from './shared/search'
import type { TagCount } from './shared/tags'
import type { PageChange, PageVersion, RelayStore } from './store/relay-store'
import type { PageThread } from './store/thread-service'

export interface EventsQuery {
  since?: string | undefined
  types?: string[] | undefined
  projectId?: string | undefined
  excludeActor?: string | undefined
  limit?: number | undefined
}

export interface ThreadOptions {
  anchorText?: string
  context?: { prefix: string; suffix: string }
  to?: string[]
}

export type PageMetadata = Omit<Page, 'body' | 'excerpt'>

export function pageMetadata({ body: _body, excerpt: _excerpt, ...metadata }: Page): PageMetadata {
  return metadata
}

export type PageRead =
  | (Page & { outline: OutlineEntry[] })
  | (PageMetadata & { outline: OutlineEntry[] })
  | { id: string; revision: string; unchanged: true }

export class Workspace {
  constructor(
    private readonly store: RelayStore,
    readonly access: Access,
  ) {}

  whoami(): Whoami {
    const { actor, scope, projectId, kind, sessionId } = this.access.auth
    return {
      handle: actor,
      displayName: this.store.accounts.displayNameOf(actor) ?? actor,
      scope,
      projectId,
      kind,
      session: sessionId !== undefined,
    }
  }

  people(): Person[] {
    return this.store.people()
  }

  private account(): string {
    this.access.admin()
    const { sessionId } = this.access.auth
    if (!sessionId) throw new StoreError('forbidden', 'Sign in to manage your account')
    return sessionId
  }

  async renameSelf(displayName: string): Promise<Whoami> {
    this.account()
    await this.store.renameAdmin(displayName)
    return this.whoami()
  }

  async changePassword(current: string, next: string): Promise<void> {
    await this.store.accounts.changePassword(current, next, this.account())
  }

  sessions(): SessionRecord[] {
    return this.store.accounts.listSessions(this.account())
  }

  revokeSession(id: string): void {
    this.account()
    this.store.accounts.revokeSession(id)
  }

  listProjects(): Project[] {
    const restricted = this.access.auth.projectId
    return this.store.listProjects().filter((project) => !restricted || project.id === restricted)
  }

  createProject(name: string, description: string): Promise<Project> {
    this.access.write()
    this.access.unrestricted()
    return this.store.createProject(name, description, this.access.actor)
  }

  listPages(projectId: string, status?: PageStatus): PageSummary[] {
    this.access.project(projectId)
    return this.store.listPages(projectId, status)
  }

  createPage(
    projectId: string,
    title: string,
    body: string,
    tags: readonly string[] = [],
    status?: PageStatus,
  ): Promise<Page> {
    this.access.write()
    this.access.project(projectId)
    return this.store.createPage(projectId, title, body, this.access.actor, tags, status)
  }

  setTags(id: string, tags: readonly string[], ifRevision?: string): Promise<Page> {
    this.access.write()
    this.access.page(id)
    return this.store.setTags(id, tags, ifRevision, this.access.actor)
  }

  listTags(projectId?: string): TagCount[] {
    return this.store.listTags(this.access.projectFilter(projectId))
  }

  async readPage(
    id: string,
    options: { sinceRevision?: string | undefined; includeBody?: boolean | undefined } = {},
  ): Promise<PageRead> {
    this.access.page(id)
    const page = await this.store.readPage(id)
    if (options.sinceRevision && options.sinceRevision === page.revision) {
      return { id: page.id, revision: page.revision, unchanged: true }
    }
    const outline = outlineOf(page.body)
    return options.includeBody === false ? { ...pageMetadata(page), outline } : { ...page, outline }
  }

  editPage(id: string, change: PageChange, ifRevision?: string): Promise<Page> {
    this.access.write()
    this.access.page(id)
    return this.store.editPage(id, change, ifRevision, this.access.actor)
  }

  replacePage(id: string, body: string, ifRevision: string): Promise<Page> {
    this.access.write()
    this.access.page(id)
    return this.store.replacePage(id, body, ifRevision, this.access.actor)
  }

  history(id: string) {
    this.access.page(id)
    return this.store.history(id)
  }

  version(id: string, hash: string): Promise<PageVersion> {
    this.access.page(id)
    return this.store.readVersion(id, hash)
  }

  deletePage(id: string, ifRevision?: string): Promise<void> {
    this.access.write()
    this.access.page(id)
    return this.store.deletePage(id, ifRevision, this.access.actor)
  }

  restore(id: string, hash: string, ifRevision: string): Promise<Page> {
    this.access.write()
    this.access.page(id)
    return this.store.restoreVersion(id, hash, ifRevision, this.access.actor)
  }

  async diff(id: string, from: string, to?: string): Promise<{ diff: string }> {
    this.access.page(id)
    if (!from) throw new StoreError('invalid', 'from is required')
    return { diff: await this.store.diff(id, from, to) }
  }

  listPageThreads(pageId: string): Promise<Thread[]> {
    this.access.page(pageId)
    return this.store.threads.listForPage(pageId)
  }

  listThreads(filter: {
    projectId?: string | undefined
    to?: string | undefined
    status?: ThreadStatus | undefined
  }): Promise<PageThread[]> {
    return this.store.threads.list({
      ...filter,
      projectId: this.access.projectFilter(filter.projectId),
    })
  }

  createThread(pageId: string, body: string, options: ThreadOptions = {}): Promise<Thread> {
    this.access.write()
    this.access.page(pageId)
    return this.store.threads.create(pageId, body, options, this.access.actor)
  }

  reply(threadId: string, body: string): Promise<Thread> {
    this.access.write()
    this.access.thread(threadId)
    return this.store.threads.reply(threadId, body, this.access.actor)
  }

  editMessage(threadId: string, messageId: string, body: string): Promise<Thread> {
    this.access.write()
    this.access.thread(threadId)
    return this.store.threads.editMessage(threadId, messageId, body, this.access.actor)
  }

  deleteMessage(threadId: string, messageId: string): Promise<{ threadRemoved: boolean }> {
    this.access.write()
    this.access.thread(threadId)
    return this.store.threads.deleteMessage(threadId, messageId, this.access.actor)
  }

  reopen(threadId: string): Promise<Thread> {
    this.access.write()
    this.access.thread(threadId)
    return this.store.threads.reopen(threadId, this.access.actor)
  }

  resolve(threadId: string): Promise<Thread> {
    this.access.write()
    this.access.thread(threadId)
    return this.store.threads.resolve(threadId, this.access.actor)
  }

  subscribe(listener: (event: StoreEvent) => void): () => void {
    const { projectId } = this.access.auth
    return this.store.subscribe((event) => {
      if (!projectId || event.projectId === projectId) listener(event)
    })
  }

  search(
    query: string,
    options: {
      projectId?: string | undefined
      kinds?: string[] | undefined
      limit?: number | undefined
    } = {},
  ): SearchHit[] {
    return this.store.search.query({
      query,
      projectId: this.access.projectFilter(options.projectId),
      kinds: options.kinds?.filter(
        (kind): kind is SearchKind => searchKindSchema.safeParse(kind).success,
      ),
      limit: options.limit,
    })
  }

  events(query: EventsQuery): { events: StoreEvent[]; next: string } {
    const events = this.store.listEvents({
      ...query,
      projectId: this.access.projectFilter(query.projectId),
    })
    return { events, next: events.at(-1)?.id ?? query.since ?? '' }
  }
}
