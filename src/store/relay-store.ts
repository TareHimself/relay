import { existsSync, promises as fs } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { and, eq, gt, inArray, ne } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import YAML from 'yaml'
import * as schema from '../db/schema'
import { AccountService } from '../auth/accounts'
import { TokenService } from '../auth/tokens'
import { eventCursorOf } from '../core/cursor'
import { applyEdits, revisionOf, type TextEdit } from '../core/edits'
import { StoreError } from '../core/errors'
import { excerptOf } from '../core/excerpt'
import { newId } from '../core/ids'
import { slugify } from '../core/slug'
import { assertNoFrontmatter, parsePageFile, withBody, withFrontmatter } from '../core/page-file'
import { normalizeTags, type TagCount } from '../shared/tags'
import { newEvent } from './events'
import { SearchIndex } from './search'
import { Git } from './git'
import { ThreadService } from './thread-service'
import { rewriteHistory, type TidySummary } from './tidy'
import type { Person } from '../shared/accounts'
import { docPath } from '../shared/pages'
import type { IndexProblem, Page, PageSummary, Project, StoreEvent } from '../shared/pages'
import { parseThreads, threadsPathFor, type Thread } from '../core/threads'

const migrationsFolder = ['../../drizzle', '../drizzle']
  .map((candidate) => fileURLToPath(new URL(candidate, import.meta.url)))
  .find((folder) => existsSync(folder))!

export interface EventFilter {
  since?: string | undefined
  types?: string[] | undefined
  projectId?: string | undefined
  excludeActor?: string | undefined
  limit?: number | undefined
}

interface CommitOptions {
  coalesce?: boolean
  verb?: string
  deleted?: boolean
}

export interface PageVersion {
  hash: string
  body: string
}

export interface PageChange {
  edits?: readonly TextEdit[] | undefined
  body?: string | undefined
}

interface LoadedPage {
  page: Page
  file: string
}

interface Operation {
  id: string
  path: string
  expected: string | null
  content: string
  actor: string
  event: string
  deleted?: boolean
  renameFrom?: string | null
}

function hasCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code
}

async function pathExists(path: string): Promise<boolean> {
  return fs
    .access(path)
    .then(() => true)
    .catch(() => false)
}

async function hasLegacyLayout(dataDir: string): Promise<boolean> {
  if (await pathExists(join(dataDir, '.git'))) return true
  if (await pathExists(join(dataDir, 'state.db'))) return true
  for (const entry of await fs.readdir(dataDir, { withFileTypes: true }).catch(() => [])) {
    if (entry.isDirectory() && (await pathExists(join(dataDir, entry.name, 'project.yaml'))))
      return true
  }
  return false
}

// Relay used to keep the git repo and state.db as siblings directly under
// DATA_DIR. Splitting them into projects/ and db/ lets DATA_DIR host other
// non-Relay state (e.g. a reverse proxy's own data) without it ever landing
// inside the git-tracked project repo.
async function migrateLegacyLayout(dataDir: string, repoDir: string, dbDir: string): Promise<void> {
  if (await pathExists(repoDir)) return
  if (!(await hasLegacyLayout(dataDir))) return
  await fs.mkdir(repoDir, { recursive: true })
  await fs.mkdir(dbDir, { recursive: true })
  for (const entry of await fs.readdir(dataDir, { withFileTypes: true })) {
    if (entry.name === 'projects' || entry.name === 'db') continue
    const from = join(dataDir, entry.name)
    const to = join(entry.name.startsWith('state.db') ? dbDir : repoDir, entry.name)
    await fs.rename(from, to)
  }
}

function commitIdentity(
  actor: string,
  displayName: string | undefined,
): { name: string; email: string } {
  const clean = (value: string) =>
    value
      .replace(/[<>\r\n]/g, '')
      .trim()
      .slice(0, 80)
  const handle =
    clean(actor)
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^-|-$/g, '') || 'unknown'
  return {
    name: (displayName && clean(displayName)) || clean(actor) || 'unknown',
    email: `${handle}@relay.local`,
  }
}

export class RelayStore {
  private readonly db: Database.Database
  private readonly orm: ReturnType<typeof drizzle<typeof schema>>
  private readonly dataDir: string
  private readonly repoDir: string
  private readonly repo: Git
  readonly tokens: TokenService
  readonly accounts: AccountService
  readonly threads: ThreadService
  readonly search: SearchIndex
  private readonly now: () => number
  private queue: Promise<unknown> = Promise.resolve()
  private readonly listeners = new Set<(event: StoreEvent) => void>()
  private unpublished: StoreEvent[] = []
  private problems: IndexProblem[] = []

  private constructor(
    dataDir: string,
    now: () => number,
    private readonly publicUrl: string | undefined,
  ) {
    this.now = now
    this.dataDir = resolve(dataDir)
    this.repoDir = join(this.dataDir, 'projects')
    this.repo = new Git(this.repoDir)
    this.db = new Database(join(this.dataDir, 'db', 'state.db'))
    this.db.pragma('journal_mode = WAL')
    this.orm = drizzle(this.db, { schema })
    migrate(this.orm, { migrationsFolder })
    this.tokens = new TokenService(this.orm)
    this.accounts = new AccountService(this.orm)
    this.search = new SearchIndex(this.db)
    this.threads = new ThreadService({
      orm: this.orm,
      serial: (work) => this.serial(work),
      readFile: (path) => this.readOptional(this.pathFor(path)),
      commit: (path, expected, content, actor, events) =>
        this.commitFile(path, expected, content, actor, events),
      pageRow: (id) => this.pageRow(id),
      readPage: (id) => this.readPage(id),
      allPages: () => this.listProjects().flatMap((project) => this.listPages(project.id)),
      indexed: (page, threads) => this.search.setThreads(page, threads),
    })
  }

  static async open(
    dataDir: string,
    options: { now?: () => number; publicUrl?: string | undefined } = {},
  ): Promise<RelayStore> {
    const resolved = resolve(dataDir)
    await fs.mkdir(resolved, { recursive: true })
    await migrateLegacyLayout(resolved, join(resolved, 'projects'), join(resolved, 'db'))
    await fs.mkdir(join(resolved, 'projects'), { recursive: true })
    await fs.mkdir(join(resolved, 'db'), { recursive: true })
    const store = new RelayStore(
      resolved,
      options.now ?? Date.now,
      options.publicUrl?.replace(/\/$/, ''),
    )
    await store.repo.run(['init', '-q'])
    try {
      await fs.writeFile(join(store.repoDir, '.gitignore'), 'blobs/\n', { flag: 'wx' })
    } catch (error) {
      if (!hasCode(error, 'EEXIST')) throw error
    }
    await store.recover()
    await store.rebuildIndex()
    await store.syncMailmap()
    return store
  }

  close(): void {
    this.db.close()
  }

  private pathFor(path: string): string {
    const absolute = resolve(this.repoDir, path)
    const rel = relative(this.repoDir, absolute)
    if (!rel || rel === '..' || rel.startsWith('../') || rel.startsWith('..\\')) {
      throw new StoreError('invalid', 'Invalid path')
    }
    return absolute
  }

  private async readOptional(path: string): Promise<string | null> {
    try {
      return await fs.readFile(path, 'utf8')
    } catch (error) {
      if (hasCode(error, 'ENOENT')) return null
      throw error
    }
  }

  subscribe(listener: (event: StoreEvent) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private publish(): void {
    const events = this.unpublished
    this.unpublished = []
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

  private serial<T>(work: () => Promise<T>): Promise<T> {
    const result = this.queue.then(work).finally(() => this.publish())
    this.queue = result.catch(() => undefined)
    return result
  }

  private async commitFile(
    path: string,
    expected: string | null,
    content: string,
    actor: string,
    events: StoreEvent[],
    options: CommitOptions = {},
  ): Promise<void> {
    const operation: Operation = {
      id: newId(),
      path,
      expected,
      content,
      actor,
      event: JSON.stringify(events),
      ...(options.deleted ? { deleted: true } : {}),
    }
    this.orm
      .insert(schema.operations)
      .values({ ...operation, status: 'pending' })
      .run()
    await this.finishOperation(operation, options)
  }

  private async commitRename(
    fromPath: string,
    toPath: string,
    expected: string,
    content: string,
    actor: string,
    events: StoreEvent[],
  ): Promise<void> {
    const operation: Operation = {
      id: newId(),
      path: toPath,
      expected,
      content,
      actor,
      event: JSON.stringify(events),
      renameFrom: fromPath,
    }
    this.orm
      .insert(schema.operations)
      .values({ ...operation, status: 'pending' })
      .run()
    await this.finishOperation(operation, { verb: 'rename' })
  }

  private async finishOperation(operation: Operation, options: CommitOptions = {}): Promise<void> {
    const existingCommit = await this.repo.run([
      'log',
      '--all',
      '-1',
      '--format=%H',
      '--fixed-strings',
      `--grep=Operation-ID: ${operation.id}`,
    ])
    const events = JSON.parse(operation.event) as StoreEvent[]
    if (!existingCommit && operation.renameFrom) {
      await this.moveFiles(operation.renameFrom, operation)
      if (await this.repo.hasStagedChanges()) await this.recordCommit(operation, events, options)
    } else if (!existingCommit && operation.deleted) {
      await this.removeFiles(operation)
      if (await this.repo.hasStagedChanges()) await this.recordCommit(operation, events, options)
    } else if (!existingCommit) {
      const absolute = this.pathFor(operation.path)
      const current = await this.readOptional(absolute)
      if (current !== operation.expected && current !== operation.content) {
        this.orm
          .update(schema.operations)
          .set({ status: 'conflicted' })
          .where(eq(schema.operations.id, operation.id))
          .run()
        throw new StoreError('conflict', 'File changed during save', {
          path: operation.path,
          current,
        })
      }
      if (current !== operation.content) {
        await fs.mkdir(dirname(absolute), { recursive: true })
        const temporary = `${absolute}.${operation.id}.tmp`
        await fs.writeFile(temporary, operation.content, 'utf8')
        await fs.rename(temporary, absolute)
      }
      await this.repo.run(['add', '--', operation.path])
      if (await this.repo.hasStagedChanges()) await this.recordCommit(operation, events, options)
    }
    const commitHash = existingCommit || (await this.repo.run(['rev-parse', 'HEAD']))
    this.orm.transaction((tx) => {
      tx.update(schema.operations)
        .set({ status: 'complete', commitHash })
        .where(eq(schema.operations.id, operation.id))
        .run()
      for (const event of events) {
        tx.insert(schema.events)
          .values({
            ...event,
            pageId: event.pageId ?? null,
            threadId: event.threadId ?? null,
            revision: event.revision ?? null,
            summary: event.summary ?? null,
          })
          .onConflictDoNothing()
          .run()
      }
    })
    this.unpublished.push(...events)
  }

  private async removeFiles(operation: Operation): Promise<void> {
    const paths = [operation.path, threadsPathFor(operation.path)]
    const current = await this.readOptional(this.pathFor(operation.path))
    if (current !== null && current !== operation.expected) {
      this.orm
        .update(schema.operations)
        .set({ status: 'conflicted' })
        .where(eq(schema.operations.id, operation.id))
        .run()
      throw new StoreError('conflict', 'File changed during delete', {
        path: operation.path,
        current,
      })
    }
    for (const path of paths) await fs.rm(this.pathFor(path), { force: true })
    await this.repo.run(['rm', '--cached', '--ignore-unmatch', '-q', '--', ...paths])
  }

  private async moveFiles(fromPath: string, operation: Operation): Promise<void> {
    const toPath = operation.path
    const toAbsolute = this.pathFor(toPath)
    const conflicted = (path: string, current: string | null) => {
      this.orm
        .update(schema.operations)
        .set({ status: 'conflicted' })
        .where(eq(schema.operations.id, operation.id))
        .run()
      throw new StoreError('conflict', 'File changed during rename', { path, current })
    }
    const toCurrent = await this.readOptional(toAbsolute)
    if (toCurrent === null) {
      const fromCurrent = await this.readOptional(this.pathFor(fromPath))
      if (fromCurrent !== operation.expected) conflicted(fromPath, fromCurrent)
      await fs.mkdir(dirname(toAbsolute), { recursive: true })
      const temporary = `${toAbsolute}.${operation.id}.tmp`
      await fs.writeFile(temporary, operation.content, 'utf8')
      await fs.rename(temporary, toAbsolute)
      await fs.rm(this.pathFor(fromPath), { force: true })
    } else if (toCurrent !== operation.content) {
      conflicted(toPath, toCurrent)
    }

    const fromThreads = threadsPathFor(fromPath)
    const toThreads = threadsPathFor(toPath)
    if ((await this.readOptional(this.pathFor(fromThreads))) !== null) {
      if (!(await this.readOptional(this.pathFor(toThreads)))) {
        await fs.mkdir(dirname(this.pathFor(toThreads)), { recursive: true })
        await fs.rename(this.pathFor(fromThreads), this.pathFor(toThreads))
      } else {
        await fs.rm(this.pathFor(fromThreads), { force: true })
      }
    }

    const staged = [
      toPath,
      ...((await this.readOptional(this.pathFor(toThreads))) ? [toThreads] : []),
    ]
    await this.repo.run(['add', '--', ...staged])
    await this.repo.run(['rm', '--cached', '--ignore-unmatch', '-q', '--', fromPath, fromThreads])
  }

  private async recordCommit(
    operation: Operation,
    events: StoreEvent[],
    options: CommitOptions,
  ): Promise<void> {
    const author = commitIdentity(operation.actor, this.accounts.displayNameOf(operation.actor))
    const type = events[0]?.type ?? ''
    const verb =
      options.verb ??
      (operation.renameFrom
        ? 'rename'
        : type.startsWith('comment.')
          ? 'comment'
          : type.endsWith('.created')
            ? 'create'
            : type.endsWith('.deleted')
              ? 'delete'
              : 'edit')
    const identity = ['-c', 'user.name=Relay', '-c', 'user.email=relay@relay.local']
    const authorEnv = { GIT_AUTHOR_NAME: author.name, GIT_AUTHOR_EMAIL: author.email }
    const previous =
      options.coalesce && verb === 'edit'
        ? await this.repo.autosaveHead(operation.path, author.email, this.now() / 1000)
        : null

    if (!previous) {
      const subject = operation.renameFrom
        ? `rename: ${operation.renameFrom} -> ${operation.path} (${operation.actor})`
        : `${verb}: ${operation.path} (${operation.actor})`
      await this.repo.run(
        [...identity, 'commit', '-q', '-m', subject, '-m', `Operation-ID: ${operation.id}`],
        authorEnv,
      )
      return
    }

    const parent = `${previous.hash}~1`
    if ((await this.repo.stagedTree()) === (await this.repo.treeOf(parent))) {
      await this.repo.run(['reset', '--soft', parent])
      return
    }
    await this.repo.run(
      [
        ...identity,
        'commit',
        '--amend',
        '-q',
        '-m',
        `${previous.message}\nOperation-ID: ${operation.id}`,
      ],
      authorEnv,
    )
    const amended = await this.repo.run(['rev-parse', 'HEAD'])
    this.orm
      .update(schema.operations)
      .set({ commitHash: amended })
      .where(eq(schema.operations.commitHash, previous.hash))
      .run()
  }

  private async recover(): Promise<void> {
    const pending = this.orm
      .select()
      .from(schema.operations)
      .where(eq(schema.operations.status, 'pending'))
      .all()
    for (const operation of pending) await this.finishOperation(operation)
  }

  private async rebuildIndex(): Promise<void> {
    const projects: Array<Project & { path: string }> = []
    const pages: PageSummary[] = []
    const threadRows: Array<typeof schema.threads.$inferInsert> = []
    const searchable: Array<Parameters<SearchIndex['rebuild']>[1][number]> = []
    const problems: IndexProblem[] = []
    const pageIds = new Map<string, string>()
    const pageBodies = new Map<string, string>()
    const pageThreads = new Map<string, Thread[]>()
    const projectIds = new Set<string>()
    for (const entry of await fs.readdir(this.repoDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'blobs') continue
      const projectPath = `${entry.name}/project.yaml`
      const projectText = await this.readOptional(this.pathFor(projectPath))
      if (!projectText) continue
      const project = this.parseProject(projectText)
      if (!project || projectIds.has(project.id)) {
        problems.push({
          path: projectPath,
          reason: project ? 'Duplicate project id' : 'Unreadable project.yaml (needs id and name)',
        })
        continue
      }
      projectIds.add(project.id)
      projects.push({ ...project, path: entry.name })
      const pageEntries = (
        await fs.readdir(this.pathFor(entry.name), { withFileTypes: true })
      ).sort((a, b) => a.name.localeCompare(b.name))
      for (const pageEntry of pageEntries) {
        if (!pageEntry.isFile() || !pageEntry.name.endsWith('.md')) continue
        const path = `${entry.name}/${pageEntry.name}`
        const markdown = await fs.readFile(this.pathFor(path), 'utf8')
        let meta: ReturnType<typeof parsePageFile>
        try {
          meta = parsePageFile(markdown)
        } catch (error) {
          problems.push({ path, reason: error instanceof Error ? error.message : String(error) })
          continue
        }
        const duplicateOf = pageIds.get(meta.id)
        if (duplicateOf) {
          problems.push({ path, reason: `Duplicate page id (also used by ${duplicateOf})` })
          continue
        }
        pageIds.set(meta.id, path)
        pageBodies.set(meta.id, meta.body)
        pages.push({
          id: meta.id,
          projectId: project.id,
          title: meta.title,
          path,
          url: this.urlFor(project.id, meta.id),
          revision: revisionOf(markdown),
          excerpt: excerptOf(markdown),
          updatedAt: (await fs.stat(this.pathFor(path))).mtime.toISOString(),
          tags: meta.tags,
        })
        const threadsPath = threadsPathFor(path)
        let threads: Thread[] = []
        try {
          threads = parseThreads(await this.readOptional(this.pathFor(threadsPath)))
          for (const thread of threads) {
            threadRows.push({
              id: thread.id,
              pageId: meta.id,
              projectId: project.id,
              status: thread.status,
            })
          }
        } catch (error) {
          problems.push({
            path: threadsPath,
            reason: error instanceof Error ? error.message : String(error),
          })
        }
        pageThreads.set(meta.id, threads)
      }
    }
    for (const page of pages) {
      const markdown = pageBodies.get(page.id)
      if (markdown === undefined) continue
      searchable.push({
        page: { id: page.id, projectId: page.projectId, title: page.title, body: markdown },
        threads: pageThreads.get(page.id) ?? [],
      })
    }
    this.problems = problems
    this.search.rebuild(projects, searchable)
    this.orm.transaction((tx) => {
      tx.delete(schema.threads).run()
      tx.delete(schema.pages).run()
      tx.delete(schema.projects).run()
      for (const p of projects) tx.insert(schema.projects).values(p).run()
      for (const p of pages) tx.insert(schema.pages).values(p).run()
      for (const t of threadRows) tx.insert(schema.threads).values(t).run()
    })
  }

  private parseProject(text: string): Project | null {
    try {
      const parsed = YAML.parse(text) as Record<string, unknown> | null
      if (typeof parsed?.id !== 'string' || typeof parsed.name !== 'string') return null
      const description = typeof parsed.description === 'string' ? parsed.description : ''
      return { id: parsed.id, name: parsed.name, description }
    } catch {
      return null
    }
  }

  listProblems(): IndexProblem[] {
    return [...this.problems]
  }

  private indexPage(projectId: string, path: string, markdown: string): void {
    const { id, title, tags, body } = parsePageFile(markdown)
    const row = {
      id,
      projectId,
      title,
      path,
      revision: revisionOf(markdown),
      excerpt: excerptOf(markdown),
      updatedAt: new Date().toISOString(),
      tags,
    }
    this.orm
      .insert(schema.pages)
      .values(row)
      .onConflictDoUpdate({ target: schema.pages.id, set: row })
      .run()
    this.search.setPage({ id, projectId, title, body })
  }

  listTags(projectId?: string): TagCount[] {
    return this.db
      .prepare(
        `SELECT json_each.value AS tag, COUNT(*) AS count
         FROM pages, json_each(pages.tags)
         WHERE (? IS NULL OR pages.project_id = ?)
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

  createProject(name: string, description: string, actor: string): Promise<Project> {
    return this.serial(async () => {
      const slug = slugify(name)
      if (await this.readOptional(this.pathFor(`${slug}/project.yaml`)))
        throw new StoreError('conflict', 'Project slug already exists')
      const project = { id: newId(), name, description }
      const event = newEvent('project.created', actor, project.id)
      await this.commitFile(`${slug}/project.yaml`, null, YAML.stringify(project), actor, [event])
      this.orm
        .insert(schema.projects)
        .values({ ...project, path: slug })
        .run()
      this.search.setProject(project)
      return project
    })
  }

  renameProject(id: string, name: string, actor: string): Promise<Project> {
    return this.serial(async () => {
      const trimmed = name.trim()
      if (!trimmed) throw new StoreError('invalid', 'Name cannot be empty')
      const row = this.orm.select().from(schema.projects).where(eq(schema.projects.id, id)).get()
      if (!row) throw new StoreError('not_found', 'Project not found')
      if (trimmed === row.name) return { id: row.id, name: row.name, description: row.description }
      const path = `${row.path}/project.yaml`
      const raw = await this.readOptional(this.pathFor(path))
      if (raw === null) throw new StoreError('not_found', 'Project not found')
      const document = YAML.parseDocument(raw)
      document.set('name', trimmed)
      const next = `${document.toString().trimEnd()}\n`
      const project = { id: row.id, name: trimmed, description: row.description }
      const event = newEvent('project.updated', actor, id, { summary: `Renamed to "${trimmed}"` })
      await this.commitFile(path, raw, next, actor, [event])
      this.orm
        .update(schema.projects)
        .set({ name: trimmed })
        .where(eq(schema.projects.id, id))
        .run()
      this.search.setProject(project)
      return project
    })
  }

  private urlFor(projectId: string, pageId: string): string {
    return (this.publicUrl ?? '') + docPath(projectId, pageId)
  }

  private summaryOf(row: typeof schema.pages.$inferSelect): PageSummary {
    return { ...row, url: this.urlFor(row.projectId, row.id) }
  }

  listPages(projectId: string): PageSummary[] {
    return this.orm
      .select()
      .from(schema.pages)
      .where(eq(schema.pages.projectId, projectId))
      .orderBy(schema.pages.title)
      .all()
      .map((row) => this.summaryOf(row))
  }

  private pageRow(id: string): PageSummary {
    const row = this.orm.select().from(schema.pages).where(eq(schema.pages.id, id)).get()
    if (!row) throw new StoreError('not_found', 'Page not found')
    return this.summaryOf(row)
  }

  private async loadPage(id: string): Promise<LoadedPage> {
    const row = this.pageRow(id)
    const file = await fs.readFile(this.pathFor(row.path), 'utf8')
    const meta = parsePageFile(file)
    return {
      file,
      page: {
        ...row,
        title: meta.title,
        tags: meta.tags,
        revision: revisionOf(file),
        excerpt: excerptOf(file),
        body: meta.body,
      },
    }
  }

  async readPage(id: string): Promise<Page> {
    return (await this.loadPage(id)).page
  }

  createPage(
    projectId: string,
    title: string,
    body: string,
    actor: string,
    tags: readonly string[] = [],
  ): Promise<Page> {
    assertNoFrontmatter(body)
    return this.serial(async () => {
      const project = this.orm
        .select({ path: schema.projects.path })
        .from(schema.projects)
        .where(eq(schema.projects.id, projectId))
        .get()
      if (!project) throw new StoreError('not_found', 'Project not found')
      const path = `${project.path}/${slugify(title)}.md`
      if (await this.readOptional(this.pathFor(path)))
        throw new StoreError('conflict', 'Page slug already exists')
      const id = newId()
      const markdown = `---\n${YAML.stringify({ id, title, tags: normalizeTags(tags) })}---\n\n${body.trimEnd()}\n`
      const event = newEvent('page.created', actor, projectId, {
        pageId: id,
        revision: revisionOf(markdown),
      })
      await this.commitFile(path, null, markdown, actor, [event])
      this.indexPage(projectId, path, markdown)
      return this.readPage(id)
    })
  }

  editPage(
    id: string,
    change: PageChange,
    ifRevision: string | undefined,
    actor: string,
  ): Promise<Page> {
    const { edits, body } = change
    if (edits && body !== undefined) throw new StoreError('invalid', 'Pass edits or body, not both')
    if (!edits && body === undefined)
      throw new StoreError('invalid', 'Nothing to change: pass edits or body')
    return this.serial(async () => {
      const current = await this.loadPage(id)
      const { page } = current
      if (ifRevision && ifRevision !== page.revision)
        throw new StoreError('conflict', 'Page revision changed', { current: page })
      const nextBody = edits ? applyEdits(page.body, edits) : `${(body ?? '').trimEnd()}\n`
      assertNoFrontmatter(nextBody, page.body)
      const next = withBody(current.file, nextBody)
      return this.commitPageContent(current, next, actor)
    })
  }

  replacePage(id: string, body: string, ifRevision: string, actor: string): Promise<Page> {
    return this.serial(async () => {
      const current = await this.loadPage(id)
      if (ifRevision !== current.page.revision)
        throw new StoreError('conflict', 'Page revision changed', { current: current.page })
      assertNoFrontmatter(body, current.page.body)
      return this.commitPageContent(current, withBody(current.file, body), actor, {
        coalesce: true,
      })
    })
  }

  setTags(
    id: string,
    tags: readonly string[],
    ifRevision: string | undefined,
    actor: string,
  ): Promise<Page> {
    return this.serial(async () => {
      const current = await this.loadPage(id)
      if (ifRevision && ifRevision !== current.page.revision)
        throw new StoreError('conflict', 'Page revision changed', { current: current.page })
      return this.commitPageContent(
        current,
        withFrontmatter(current.file, { tags: normalizeTags(tags) }),
        actor,
        { coalesce: true, summary: 'Changed tags' },
      )
    })
  }

  renamePage(
    id: string,
    title: string,
    ifRevision: string | undefined,
    actor: string,
  ): Promise<Page> {
    return this.serial(async () => {
      const trimmed = title.trim()
      if (!trimmed) throw new StoreError('invalid', 'Title cannot be empty')
      const current = await this.loadPage(id)
      const { page, file } = current
      if (ifRevision && ifRevision !== page.revision)
        throw new StoreError('conflict', 'Page revision changed', { current: page })
      if (trimmed === page.title) return page
      const next = withFrontmatter(file, { title: trimmed })
      const newPath = `${dirname(page.path)}/${slugify(trimmed)}.md`
      const summary = `Renamed to "${trimmed}"`
      if (newPath === page.path) {
        return this.commitPageContent(current, next, actor, { summary })
      }
      if (await this.readOptional(this.pathFor(newPath)))
        throw new StoreError('conflict', 'A page with that title already exists')
      const event = newEvent('page.updated', actor, page.projectId, {
        pageId: id,
        revision: revisionOf(next),
        summary,
      })
      await this.commitRename(page.path, newPath, file, next, actor, [event])
      this.indexPage(page.projectId, newPath, next)
      return this.readPage(id)
    })
  }

  deletePage(id: string, ifRevision: string | undefined, actor: string): Promise<void> {
    return this.serial(async () => {
      const { page, file } = await this.loadPage(id)
      if (ifRevision && ifRevision !== page.revision)
        throw new StoreError('conflict', 'Page revision changed', { current: page })
      const event = newEvent('page.deleted', actor, page.projectId, {
        pageId: id,
        summary: page.title,
      })
      await this.commitFile(page.path, file, '', actor, [event], { deleted: true })
      this.orm.transaction((tx) => {
        tx.delete(schema.threads).where(eq(schema.threads.pageId, id)).run()
        tx.delete(schema.pages).where(eq(schema.pages.id, id)).run()
      })
      this.search.removePage(id)
    })
  }

  async readVersion(id: string, hash: string): Promise<PageVersion> {
    const version = await this.versionOf(await this.readPage(id), hash)
    return { hash: version.hash, body: parsePageFile(version.markdown).body }
  }

  private async versionOf(page: Page, hash: string): Promise<{ hash: string; markdown: string }> {
    if (!/^[0-9a-f]{7,40}$/.test(hash)) throw new StoreError('invalid', 'Use a commit hash')
    const full = (await this.repo.commitsTouching(page.path)).find((commit) =>
      commit.startsWith(hash),
    )
    if (!full) throw new StoreError('not_found', 'That version is not in this page history')
    return { hash: full, markdown: await this.repo.show(full, page.path) }
  }

  restoreVersion(id: string, hash: string, ifRevision: string, actor: string): Promise<Page> {
    return this.serial(async () => {
      const current = await this.loadPage(id)
      if (ifRevision !== current.page.revision)
        throw new StoreError('conflict', 'Page revision changed', { current: current.page })
      const version = await this.versionOf(current.page, hash)
      return this.commitPageContent(current, version.markdown, actor, {
        verb: 'restore',
        summary: `Restored version ${version.hash.slice(0, 7)}`,
      })
    })
  }

  private async commitPageContent(
    { page, file }: LoadedPage,
    next: string,
    actor: string,
    options: CommitOptions & { summary?: string } = {},
  ): Promise<Page> {
    if (next === file) return page
    if (parsePageFile(next).id !== page.id) throw new StoreError('invalid', 'Page id cannot change')
    const event = newEvent('page.updated', actor, page.projectId, {
      pageId: page.id,
      revision: revisionOf(next),
      ...(options.summary ? { summary: options.summary } : {}),
    })
    await this.commitFile(page.path, file, next, actor, [event], options)
    this.indexPage(page.projectId, page.path, next)
    return this.readPage(page.id)
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

  projectIdOfPage(pageId: string): string {
    return this.pageRow(pageId).projectId
  }

  async diff(id: string, from: string, to = 'HEAD'): Promise<string> {
    const page = await this.readPage(id)
    const ref = /^([0-9a-f]{7,40}|HEAD)$/
    if (!ref.test(from) || !ref.test(to)) throw new StoreError('invalid', 'Use commit hashes')
    return this.repo.run(['diff', '--no-color', from, to, '--', page.path])
  }

  tidyHistory(apply: boolean): Promise<TidySummary> {
    return this.serial(async () => {
      const humans = new Set([...this.accounts.users().map((user) => user.handle), 'local'])
      const stamp = new Date(this.now()).toISOString().replace(/[-:.]/g, '').slice(0, 15)
      const { summary, remapped } = await rewriteHistory(this.repo, humans, apply, stamp)
      this.orm.transaction((tx) => {
        for (const [oldHash, newHash] of remapped) {
          tx.update(schema.operations)
            .set({ commitHash: newHash })
            .where(eq(schema.operations.commitHash, oldHash))
            .run()
        }
      })
      return summary
    })
  }

  async syncMailmap(): Promise<void> {
    const file = join(this.repoDir, '.git', 'relay-mailmap')
    const plain = (name: string) => name.replace(/[<>\r\n]/g, '')
    const lines = this.accounts
      .users()
      .map((user) => `${plain(user.displayName)} <${user.handle}@relay.local>`)
    const admin = this.accounts.admin()
    const legacy = await this.repo
      .run(['log', '--no-mailmap', '-1', '--format=%H', '--author=<local@relay.local>'])
      .catch(() => '')
    if (admin && legacy) {
      lines.push(`${plain(admin.displayName)} <${admin.handle}@relay.local> <local@relay.local>`)
    }
    await fs.writeFile(file, `${lines.join('\n')}\n`, 'utf8')
    await this.repo.run(['config', 'mailmap.file', file])
  }

  async adoptActor(from: string, to: string): Promise<{ threadFiles: number; events: number }> {
    const threadFiles = await this.threads.adoptAuthor(from, to)
    const events = this.orm
      .update(schema.events)
      .set({ actor: to })
      .where(eq(schema.events.actor, from))
      .run().changes
    await this.syncMailmap()
    return { threadFiles, events }
  }

  async renameAdmin(displayName: string): Promise<void> {
    this.accounts.setDisplayName(displayName)
    await this.syncMailmap()
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

  async history(
    id: string,
  ): Promise<{ hash: string; author: string; handle: string; date: string; subject: string }[]> {
    const page = await this.readPage(id)
    const output = await this.repo.run([
      'log',
      '--format=%H%x09%aN%x09%cI%x09%s%x09%aE',
      '--',
      page.path,
    ])
    return output
      ? output.split('\n').map((line) => {
          const [hash = '', author = '', date = '', subject = '', email = ''] = line.split('\t')
          return { hash, author, handle: email.split('@')[0] ?? '', date, subject }
        })
      : []
  }
}
