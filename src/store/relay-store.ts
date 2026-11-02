import { existsSync, promises as fs } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { createTwoFilesPatch } from 'diff'
import { and, count, desc, eq, gt, inArray, isNull, ne } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from '../db/schema'
import { AccountService } from '../auth/accounts'
import { TokenService } from '../auth/tokens'
import { SettingsService } from './settings'
import { eventCursorOf } from '../core/cursor'
import { applyEdits, revisionOf, type PageContent, type TextEdit } from '../core/edits'
import { StoreError } from '../core/errors'
import { excerptOf } from '../core/excerpt'
import { newId } from '../core/ids'
import { slugify } from '../core/slug'
import { assertNoFrontmatter } from '../core/page-file'
import { normalizeTags, type TagCount } from '../shared/tags'
import { newEvent } from './events'
import { importLegacyRepo } from './import-git'
import { SearchIndex } from './search'
import { ThreadService } from './thread-service'
import type { Person } from '../shared/accounts'
import { docHref } from '../shared/pages'
import type {
  HistoryEntry,
  Page,
  PageSummary,
  PageVersion,
  Project,
  StoreEvent,
  VersionKind,
} from '../shared/pages'

export const migrationsFolder = ['../../drizzle', '../drizzle']
  .map((candidate) => fileURLToPath(new URL(candidate, import.meta.url)))
  .find((folder) => existsSync(folder))!

export const AUTOSAVE_IDLE_SECONDS = 180
export const AUTOSAVE_MAX_SECONDS = 1800

export interface EventFilter {
  since?: string | undefined
  types?: string[] | undefined
  projectId?: string | undefined
  excludeActor?: string | undefined
  limit?: number | undefined
}

export interface PageChange {
  edits?: readonly TextEdit[] | undefined
  body?: string | undefined
}

export interface HistoryQuery {
  limit?: number | undefined
  offset?: number | undefined
}

export interface SnapshotInfo {
  projects: number
  pages: number
  threads: number
}

export type Emit = (event: StoreEvent) => void

type PageRow = typeof schema.pages.$inferSelect
type VersionRow = typeof schema.pageVersions.$inferSelect

interface SaveOptions {
  kind: VersionKind
  summary?: string | undefined
  coalesce?: boolean | undefined
}

export class RelayStore {
  private readonly db: Database.Database
  private readonly orm: ReturnType<typeof drizzle<typeof schema>>
  private readonly dataDir: string
  readonly tokens: TokenService
  readonly accounts: AccountService
  readonly settings: SettingsService
  readonly threads: ThreadService
  readonly search: SearchIndex
  private readonly now: () => number
  private readonly listeners = new Set<(event: StoreEvent) => void>()
  private pending: StoreEvent[] | null = null

  private constructor(
    dataDir: string,
    now: () => number,
    private readonly publicUrl: string | undefined,
  ) {
    this.now = now
    this.dataDir = resolve(dataDir)
    this.db = new Database(join(this.dataDir, 'db', 'state.db'))
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('synchronous = NORMAL')
    this.db.pragma('busy_timeout = 5000')
    this.orm = drizzle(this.db, { schema })
    migrate(this.orm, { migrationsFolder })
    this.tokens = new TokenService(this.orm)
    this.accounts = new AccountService(this.orm)
    this.settings = new SettingsService(this.orm)
    this.search = new SearchIndex(this.db)
    this.threads = new ThreadService({
      orm: this.orm,
      pageRow: (id) => this.summaryOf(this.pageRow(id)),
      readPage: (id) => this.readPage(id),
      write: (work) => this.write(work),
      now: () => new Date(this.now()).toISOString(),
    })
  }

  static async open(
    dataDir: string,
    options: {
      now?: () => number
      publicUrl?: string | undefined
      log?: ((line: string) => void) | undefined
    } = {},
  ): Promise<RelayStore> {
    const resolved = resolve(dataDir)
    await fs.mkdir(join(resolved, 'db'), { recursive: true })
    const store = new RelayStore(
      resolved,
      options.now ?? Date.now,
      options.publicUrl?.replace(/\/$/, ''),
    )
    await importLegacyRepo(store.db, join(resolved, 'projects'), options.log ?? (() => {}))
    return store
  }

  close(): void {
    if (!this.db.open) return
    this.db.pragma('optimize')
    this.db.close()
  }

  subscribe(listener: (event: StoreEvent) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private publish(events: readonly StoreEvent[]): void {
    for (const event of events) {
      for (const listener of this.listeners) {
        try {
          listener(event)
        } catch {
          this.listeners.delete(listener)
        }
      }
    }
  }

  private write<T>(work: (emit: Emit) => T): T {
    const outer = this.pending
    if (outer) return work((event) => outer.push(event))
    const events: StoreEvent[] = []
    this.pending = events
    try {
      const result = this.db.transaction(() => {
        const value = work((event) => events.push(event))
        for (const event of events) {
          this.orm
            .insert(schema.events)
            .values({
              ...event,
              pageId: event.pageId ?? null,
              threadId: event.threadId ?? null,
              revision: event.revision ?? null,
              summary: event.summary ?? null,
            })
            .run()
        }
        return value
      })()
      this.pending = null
      this.publish(events)
      return result
    } finally {
      this.pending = null
    }
  }

  private stamp(): string {
    return new Date(this.now()).toISOString()
  }

  listTags(projectId?: string): TagCount[] {
    return this.db
      .prepare(
        `SELECT json_each.value AS tag, COUNT(*) AS count
         FROM pages, json_each(pages.tags)
         WHERE pages.deleted_at IS NULL AND (? IS NULL OR pages.project_id = ?)
         GROUP BY json_each.value
         ORDER BY json_each.value`,
      )
      .all(projectId ?? null, projectId ?? null) as TagCount[]
  }

  listProjects(): Project[] {
    return this.orm
      .select({
        id: schema.projects.id,
        name: schema.projects.name,
        description: schema.projects.description,
      })
      .from(schema.projects)
      .orderBy(schema.projects.name)
      .all()
  }

  createProject(name: string, description: string, actor: string): Project {
    const trimmed = name.trim()
    if (!trimmed) throw new StoreError('invalid', 'Name cannot be empty')
    const slug = slugify(trimmed)
    return this.write((emit) => {
      const taken = this.orm
        .select({ id: schema.projects.id })
        .from(schema.projects)
        .where(eq(schema.projects.slug, slug))
        .get()
      if (taken) throw new StoreError('conflict', 'A project with that name already exists')
      const project = { id: newId(), name: trimmed, description }
      this.orm
        .insert(schema.projects)
        .values({ ...project, slug, createdAt: this.stamp() })
        .run()
      emit(newEvent('project.created', actor, project.id))
      return project
    })
  }

  private updateProject(
    id: string,
    changes: { name?: string; description?: string },
    actor: string,
  ): Project {
    const name = changes.name?.trim()
    if (changes.name !== undefined && !name) throw new StoreError('invalid', 'Name cannot be empty')
    return this.write((emit) => {
      const row = this.orm.select().from(schema.projects).where(eq(schema.projects.id, id)).get()
      if (!row) throw new StoreError('not_found', 'Project not found')
      const nextName = name ?? row.name
      const nextDescription = changes.description ?? row.description
      const project = { id: row.id, name: nextName, description: nextDescription }
      if (nextName === row.name && nextDescription === row.description) return project
      this.orm
        .update(schema.projects)
        .set({ name: nextName, description: nextDescription })
        .where(eq(schema.projects.id, id))
        .run()
      const renamed = nextName !== row.name
      const redescribed = nextDescription !== row.description
      const summary = renamed
        ? redescribed
          ? `Renamed to "${nextName}" and changed the description`
          : `Renamed to "${nextName}"`
        : 'Changed the description'
      emit(newEvent('project.updated', actor, id, { summary }))
      return project
    })
  }

  renameProject(id: string, name: string, actor: string): Project {
    return this.updateProject(id, { name }, actor)
  }

  setProjectDescription(id: string, description: string, actor: string): Project {
    return this.updateProject(id, { description }, actor)
  }

  private urlFor(pageId: string): string {
    return (this.publicUrl ?? '') + docHref(pageId)
  }

  private summaryOf(row: PageRow): PageSummary {
    return {
      id: row.id,
      projectId: row.projectId,
      title: row.title,
      url: this.urlFor(row.id),
      revision: row.revision,
      excerpt: row.excerpt,
      updatedAt: row.updatedAt,
      tags: row.tags,
    }
  }

  private pageOf(row: PageRow): Page {
    return { ...this.summaryOf(row), body: row.body }
  }

  listPages(projectId: string): PageSummary[] {
    return this.orm
      .select()
      .from(schema.pages)
      .where(and(eq(schema.pages.projectId, projectId), isNull(schema.pages.deletedAt)))
      .orderBy(schema.pages.title)
      .all()
      .map((row) => this.summaryOf(row))
  }

  private pageRow(id: string): PageRow {
    const row = this.orm
      .select()
      .from(schema.pages)
      .where(and(eq(schema.pages.id, id), isNull(schema.pages.deletedAt)))
      .get()
    if (!row) throw new StoreError('not_found', 'Page not found')
    return row
  }

  readPage(id: string): Page {
    return this.pageOf(this.pageRow(id))
  }

  projectIdOfPage(pageId: string): string {
    return this.pageRow(pageId).projectId
  }

  private assertSlugFree(projectId: string, slug: string, exceptId?: string): void {
    const taken = this.orm
      .select({ id: schema.pages.id })
      .from(schema.pages)
      .where(
        and(
          eq(schema.pages.projectId, projectId),
          eq(schema.pages.slug, slug),
          isNull(schema.pages.deletedAt),
          exceptId ? ne(schema.pages.id, exceptId) : undefined,
        ),
      )
      .get()
    if (taken) throw new StoreError('conflict', 'A page with that title already exists')
  }

  createPage(
    projectId: string,
    title: string,
    body: string,
    actor: string,
    tags: readonly string[] = [],
  ): Page {
    const trimmed = title.trim()
    if (!trimmed) throw new StoreError('invalid', 'Title cannot be empty')
    assertNoFrontmatter(body)
    const slug = slugify(trimmed)
    return this.write((emit) => {
      const project = this.orm
        .select({ id: schema.projects.id })
        .from(schema.projects)
        .where(eq(schema.projects.id, projectId))
        .get()
      if (!project) throw new StoreError('not_found', 'Project not found')
      this.assertSlugFree(projectId, slug)
      const content: PageContent = {
        title: trimmed,
        tags: normalizeTags(tags),
        body: `${body.trimEnd()}\n`,
      }
      const now = this.stamp()
      const row: PageRow = {
        id: newId(),
        projectId,
        title: content.title,
        slug,
        body: content.body,
        tags: [...content.tags],
        revision: revisionOf(content),
        excerpt: excerptOf(content.body),
        createdAt: now,
        updatedAt: now,
        updatedBy: actor,
        deletedAt: null,
      }
      this.orm.insert(schema.pages).values(row).run()
      this.insertVersion(row, actor, 'create', null, now)
      emit(newEvent('page.created', actor, projectId, { pageId: row.id, revision: row.revision }))
      return this.pageOf(row)
    })
  }

  private insertVersion(
    row: PageRow,
    actor: string,
    kind: VersionKind,
    summary: string | null,
    now: string,
  ): void {
    this.orm
      .insert(schema.pageVersions)
      .values({
        id: newId(),
        pageId: row.id,
        projectId: row.projectId,
        kind,
        title: row.title,
        tags: row.tags,
        body: row.body,
        revision: row.revision,
        actor,
        summary,
        createdAt: now,
        updatedAt: now,
      })
      .run()
  }

  private latestVersions(pageId: string, limit: number): VersionRow[] {
    return this.orm
      .select()
      .from(schema.pageVersions)
      .where(eq(schema.pageVersions.pageId, pageId))
      .orderBy(desc(schema.pageVersions.id))
      .limit(limit)
      .all()
  }

  private canCoalesce(last: VersionRow | undefined, actor: string): last is VersionRow {
    if (!last || last.kind !== 'edit' || last.actor !== actor) return false
    const now = this.now()
    return (
      now - Date.parse(last.updatedAt) <= AUTOSAVE_IDLE_SECONDS * 1000 &&
      now - Date.parse(last.createdAt) <= AUTOSAVE_MAX_SECONDS * 1000
    )
  }

  private save(
    current: PageRow,
    next: PageContent,
    actor: string,
    options: SaveOptions,
    emit: Emit,
  ): Page {
    const revision = revisionOf(next)
    if (revision === current.revision) return this.pageOf(current)
    const now = this.stamp()
    const row: PageRow = {
      ...current,
      title: next.title,
      slug: slugify(next.title),
      tags: [...next.tags],
      body: next.body,
      revision,
      excerpt: excerptOf(next.body),
      updatedAt: now,
      updatedBy: actor,
    }
    this.orm
      .update(schema.pages)
      .set({
        title: row.title,
        slug: row.slug,
        tags: row.tags,
        body: row.body,
        revision: row.revision,
        excerpt: row.excerpt,
        updatedAt: row.updatedAt,
        updatedBy: row.updatedBy,
      })
      .where(eq(schema.pages.id, row.id))
      .run()

    const [last, previous] = this.latestVersions(row.id, 2)
    if (options.kind === 'edit' && options.coalesce && this.canCoalesce(last, actor)) {
      if (previous && previous.revision === revision) {
        this.orm.delete(schema.pageVersions).where(eq(schema.pageVersions.id, last.id)).run()
      } else {
        this.orm
          .update(schema.pageVersions)
          .set({
            title: row.title,
            tags: row.tags,
            body: row.body,
            revision,
            updatedAt: now,
          })
          .where(eq(schema.pageVersions.id, last.id))
          .run()
      }
    } else {
      this.insertVersion(row, actor, options.kind, options.summary ?? null, now)
    }
    emit(
      newEvent('page.updated', actor, row.projectId, {
        pageId: row.id,
        revision,
        ...(options.summary ? { summary: options.summary } : {}),
      }),
    )
    return this.pageOf(row)
  }

  private guarded(id: string, ifRevision: string | undefined): PageRow {
    const current = this.pageRow(id)
    if (ifRevision !== undefined && ifRevision !== current.revision) {
      throw new StoreError('conflict', 'Page revision changed', { current: this.pageOf(current) })
    }
    return current
  }

  editPage(id: string, change: PageChange, ifRevision: string | undefined, actor: string): Page {
    const { edits, body } = change
    if (edits && body !== undefined) throw new StoreError('invalid', 'Pass edits or body, not both')
    if (!edits && body === undefined)
      throw new StoreError('invalid', 'Nothing to change: pass edits or body')
    return this.write((emit) => {
      const current = this.guarded(id, ifRevision)
      const nextBody = edits ? applyEdits(current.body, edits) : `${(body ?? '').trimEnd()}\n`
      assertNoFrontmatter(nextBody, current.body)
      return this.save(current, { ...current, body: nextBody }, actor, { kind: 'edit' }, emit)
    })
  }

  replacePage(id: string, body: string, ifRevision: string, actor: string): Page {
    return this.write((emit) => {
      const current = this.guarded(id, ifRevision)
      assertNoFrontmatter(body, current.body)
      return this.save(current, { ...current, body }, actor, { kind: 'edit', coalesce: true }, emit)
    })
  }

  setTags(
    id: string,
    tags: readonly string[],
    ifRevision: string | undefined,
    actor: string,
  ): Page {
    return this.write((emit) => {
      const current = this.guarded(id, ifRevision)
      return this.save(
        current,
        { ...current, tags: normalizeTags(tags) },
        actor,
        { kind: 'tags', summary: 'Changed tags' },
        emit,
      )
    })
  }

  renamePage(id: string, title: string, ifRevision: string | undefined, actor: string): Page {
    const trimmed = title.trim()
    if (!trimmed) throw new StoreError('invalid', 'Title cannot be empty')
    return this.write((emit) => {
      const current = this.guarded(id, ifRevision)
      if (trimmed === current.title) return this.pageOf(current)
      this.assertSlugFree(current.projectId, slugify(trimmed), current.id)
      return this.save(
        current,
        { ...current, title: trimmed },
        actor,
        { kind: 'rename', summary: `Renamed to "${trimmed}"` },
        emit,
      )
    })
  }

  deletePage(id: string, ifRevision: string | undefined, actor: string): void {
    this.write((emit) => {
      const current = this.guarded(id, ifRevision)
      const now = this.stamp()
      this.orm
        .update(schema.pages)
        .set({ deletedAt: now, updatedAt: now, updatedBy: actor })
        .where(eq(schema.pages.id, id))
        .run()
      this.insertVersion(current, actor, 'delete', current.title, now)
      emit(
        newEvent('page.deleted', actor, current.projectId, { pageId: id, summary: current.title }),
      )
    })
  }

  history(id: string, query: HistoryQuery = {}): HistoryEntry[] {
    this.pageRow(id)
    const limit = Math.min(Math.max(query.limit ?? 100, 1), 500)
    const offset = Math.max(query.offset ?? 0, 0)
    return this.orm
      .select({
        id: schema.pageVersions.id,
        kind: schema.pageVersions.kind,
        actor: schema.pageVersions.actor,
        summary: schema.pageVersions.summary,
        createdAt: schema.pageVersions.createdAt,
        updatedAt: schema.pageVersions.updatedAt,
      })
      .from(schema.pageVersions)
      .where(eq(schema.pageVersions.pageId, id))
      .orderBy(desc(schema.pageVersions.id))
      .limit(limit)
      .offset(offset)
      .all()
  }

  private versionRow(pageId: string, versionId: string): VersionRow {
    const row = this.orm
      .select()
      .from(schema.pageVersions)
      .where(and(eq(schema.pageVersions.pageId, pageId), eq(schema.pageVersions.id, versionId)))
      .get()
    if (!row) throw new StoreError('not_found', 'That version is not in this page history')
    return row
  }

  readVersion(id: string, versionId: string): PageVersion {
    this.pageRow(id)
    const { projectId: _projectId, ...version } = this.versionRow(id, versionId)
    return version
  }

  restoreVersion(id: string, versionId: string, ifRevision: string, actor: string): Page {
    return this.write((emit) => {
      const current = this.guarded(id, ifRevision)
      const version = this.versionRow(id, versionId)
      this.assertSlugFree(current.projectId, slugify(version.title), current.id)
      return this.save(
        current,
        { title: version.title, tags: version.tags, body: version.body },
        actor,
        { kind: 'restore', summary: `Restored the version from ${version.updatedAt}` },
        emit,
      )
    })
  }

  diff(id: string, from: string, to?: string): string {
    const page = this.pageRow(id)
    const older = this.versionRow(id, from)
    const newer = to ? this.versionRow(id, to) : null
    const label = (when: string) => `${page.slug}.md (${when})`
    return createTwoFilesPatch(
      label(older.updatedAt),
      label(newer ? newer.updatedAt : 'current'),
      older.body,
      newer ? newer.body : page.body,
      undefined,
      undefined,
      { context: 3 },
    )
  }

  listEvents(filter: EventFilter = {}): StoreEvent[] {
    const limit = Math.min(Math.max(filter.limit ?? 100, 1), 500)
    return this.orm
      .select()
      .from(schema.events)
      .where(
        and(
          gt(schema.events.id, eventCursorOf(filter.since)),
          filter.types?.length ? inArray(schema.events.type, filter.types) : undefined,
          filter.projectId ? eq(schema.events.projectId, filter.projectId) : undefined,
          filter.excludeActor ? ne(schema.events.actor, filter.excludeActor) : undefined,
        ),
      )
      .orderBy(schema.events.id)
      .limit(limit)
      .all()
      .map((event) => ({
        ...event,
        pageId: event.pageId ?? undefined,
        threadId: event.threadId ?? undefined,
        revision: event.revision ?? undefined,
        summary: event.summary ?? undefined,
      }))
  }

  snapshot(dir: string): SnapshotInfo {
    this.db.prepare('VACUUM INTO ?').run(join(dir, 'state.db'))
    const rows = (table: typeof schema.projects | typeof schema.threads) =>
      this.orm.select({ n: count() }).from(table).get()?.n ?? 0
    return {
      projects: rows(schema.projects),
      pages:
        this.orm
          .select({ n: count() })
          .from(schema.pages)
          .where(isNull(schema.pages.deletedAt))
          .get()?.n ?? 0,
      threads: rows(schema.threads),
    }
  }

  integrityCheck(): string[] {
    const rows = this.db.prepare('PRAGMA integrity_check').all() as { integrity_check: string }[]
    return rows.map((row) => row.integrity_check)
  }

  tableSizes(): { table: string; bytes: number }[] {
    return this.db
      .prepare(
        `SELECT name AS "table", SUM(pgsize) AS bytes FROM dbstat
         WHERE name NOT LIKE 'sqlite_%' GROUP BY name ORDER BY bytes DESC`,
      )
      .all() as { table: string; bytes: number }[]
  }

  renameAdmin(displayName: string): void {
    this.accounts.setDisplayName(displayName)
  }

  people(): Person[] {
    const users = this.accounts.users().map((user) => ({
      handle: user.handle,
      displayName: user.displayName,
      kind: 'user' as const,
    }))
    const agents = this.tokens
      .list()
      .filter((token) => !users.some((user) => user.handle === token.name))
      .map((token) => ({ handle: token.name, displayName: token.name, kind: 'agent' as const }))
    return [...users, ...agents]
  }

  get database(): Database.Database {
    return this.db
  }
}
