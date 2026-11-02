import { execFile } from 'node:child_process'
import { existsSync, promises as fs } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type Database from 'better-sqlite3'
import YAML from 'yaml'
import { revisionOf } from '../core/edits'
import { excerptOf } from '../core/excerpt'
import { newId } from '../core/ids'
import { parsePageFile } from '../core/page-file'
import { slugify } from '../core/slug'
import { threadFileSchema, type Thread } from '../shared/threads'
import type { VersionKind } from '../db/schema'

const exec = promisify(execFile)
const SEP = '\u001f'
const SUBJECT = /^(create|edit|rename|restore|delete|comment)\b.*\(([^()]+)\)$/

export type Log = (line: string) => void

export interface ImportSummary {
  projects: number
  pages: number
  deletedPages: number
  versions: number
  threads: number
}

interface Commit {
  hash: string
  email: string
  authored: string
  committed: string
  subject: string
  path: string
}

interface Version {
  pageId: string
  kind: VersionKind
  title: string
  tags: string[]
  body: string
  actor: string
  summary: string | null
  createdAt: string
  updatedAt: string
}

interface ImportedPage {
  id: string
  projectId: string
  versions: Version[]
  deletedAt: string | null
}

export async function git(dir: string, args: string[]): Promise<string> {
  const { stdout } = await exec('git', ['-C', dir, ...args], {
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    maxBuffer: 64 * 1024 * 1024,
  })
  return stdout
}

async function commitsFor(dir: string, path: string): Promise<Commit[]> {
  const output = await git(dir, [
    'log',
    '--follow',
    '--name-only',
    `--format=%H${SEP}%aE${SEP}%aI${SEP}%cI${SEP}%s`,
    '--',
    path,
  ])
  const commits: Commit[] = []
  let current: Commit | null = null
  for (const line of output.split('\n')) {
    if (line.includes(SEP)) {
      const [hash = '', email = '', authored = '', committed = '', subject = ''] = line.split(SEP)
      current = { hash, email, authored, committed, subject, path }
      commits.push(current)
    } else if (line.trim() && current && current.path === path && current.hash) {
      current.path = line.trim()
    }
  }
  return commits.reverse()
}

function kindOf(subject: string): { kind: VersionKind; actor: string | null } {
  const match = SUBJECT.exec(subject)
  const verb = match?.[1] ?? 'edit'
  const kind: VersionKind =
    verb === 'create' || verb === 'rename' || verb === 'restore' || verb === 'delete'
      ? verb
      : 'edit'
  return { kind, actor: match?.[2] ?? null }
}

function actorOf(commit: Commit): string {
  const fromSubject = kindOf(commit.subject).actor
  if (fromSubject) return fromSubject
  return commit.email.split('@')[0] || 'unknown'
}

async function importPath(
  dir: string,
  path: string,
  projectId: string,
  log: Log,
): Promise<ImportedPage[]> {
  const commits = await commitsFor(dir, path)
  const pages = new Map<string, ImportedPage>()
  let previous: ImportedPage | null = null
  for (const [index, commit] of commits.entries()) {
    let markdown: string
    try {
      markdown = await git(dir, ['show', `${commit.hash}:${commit.path}`])
    } catch {
      if (previous && index === commits.length - 1) previous.deletedAt = commit.committed
      continue
    }
    let file: ReturnType<typeof parsePageFile>
    try {
      file = parsePageFile(markdown)
    } catch (error) {
      log(`Skipped ${commit.path} at ${commit.hash.slice(0, 7)}: ${(error as Error).message}`)
      continue
    }
    let page = pages.get(file.id)
    if (!page) {
      page = { id: file.id, projectId, versions: [], deletedAt: null }
      pages.set(file.id, page)
      if (previous && previous !== page && !previous.deletedAt) previous.deletedAt = commit.authored
    }
    const { kind } = kindOf(commit.subject)
    const last = page.versions.at(-1)
    page.versions.push({
      pageId: file.id,
      kind: last ? (kind === 'create' ? 'edit' : kind) : 'create',
      title: file.title,
      tags: file.tags,
      body: file.body,
      actor: actorOf(commit),
      summary: kind === 'rename' && last ? `Renamed to "${file.title}"` : null,
      createdAt: commit.authored,
      updatedAt: commit.committed,
    })
    previous = page
  }
  return [...pages.values()]
}

async function deletedPaths(dir: string): Promise<string[]> {
  const output = await git(dir, ['log', '--diff-filter=D', '--name-only', '--format=']).catch(
    () => '',
  )
  return [
    ...new Set(
      output
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.endsWith('.md') && !existsSync(join(dir, line))),
    ),
  ]
}

export async function importGitRepo(
  db: Database.Database,
  repoDir: string,
  log: Log,
): Promise<ImportSummary> {
  const projects: Array<{ id: string; name: string; description: string; createdAt: string }> = []
  const pages: ImportedPage[] = []
  const threads: Array<{ pageId: string; projectId: string; thread: Thread }> = []
  const projectOfDir = new Map<string, string>()

  for (const entry of await fs.readdir(repoDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'blobs') continue
    const projectFile = `${entry.name}/project.yaml`
    const raw = await fs.readFile(join(repoDir, projectFile), 'utf8').catch(() => null)
    if (raw === null) continue
    const parsed = YAML.parse(raw) as Record<string, unknown> | null
    if (typeof parsed?.id !== 'string' || typeof parsed.name !== 'string') {
      log(`Skipped ${projectFile}: needs id and name`)
      continue
    }
    const created =
      (await commitsFor(repoDir, projectFile))[0]?.authored ?? new Date().toISOString()
    projects.push({
      id: parsed.id,
      name: parsed.name,
      description: typeof parsed.description === 'string' ? parsed.description : '',
      createdAt: created,
    })
    projectOfDir.set(entry.name, parsed.id)

    const files = (await fs.readdir(join(repoDir, entry.name))).sort()
    for (const name of files) {
      if (!name.endsWith('.md')) continue
      pages.push(...(await importPath(repoDir, `${entry.name}/${name}`, parsed.id, log)))
    }
    for (const name of files) {
      if (!name.endsWith('.threads.json')) continue
      const pagePath = `${entry.name}/${name.replace(/\.threads\.json$/, '.md')}`
      const pageFile = await fs.readFile(join(repoDir, pagePath), 'utf8').catch(() => null)
      if (pageFile === null) continue
      const pageId = parsePageFile(pageFile).id
      try {
        const parsedThreads = threadFileSchema.parse(
          JSON.parse(await fs.readFile(join(repoDir, `${entry.name}/${name}`), 'utf8')),
        )
        for (const thread of parsedThreads.threads) {
          threads.push({ pageId, projectId: parsed.id, thread })
        }
      } catch {
        log(`Skipped ${entry.name}/${name}: malformed thread file`)
      }
    }
  }

  const seen = new Set(pages.map((page) => page.id))
  for (const path of await deletedPaths(repoDir)) {
    const projectId = projectOfDir.get(path.split('/')[0] ?? '')
    if (!projectId) continue
    for (const page of await importPath(repoDir, path, projectId, log)) {
      if (seen.has(page.id)) continue
      seen.add(page.id)
      if (!page.deletedAt) page.deletedAt = page.versions.at(-1)?.updatedAt ?? null
      pages.push(page)
    }
  }

  const insertProject = db.prepare(
    'INSERT INTO projects (id, name, description, slug, created_at) VALUES (?, ?, ?, ?, ?)',
  )
  const insertPage = db.prepare(
    `INSERT INTO pages (id, project_id, title, slug, body, tags, revision, excerpt, created_at, updated_at, updated_by, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const insertVersion = db.prepare(
    `INSERT INTO page_versions (id, page_id, project_id, kind, title, tags, body, revision, actor, summary, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const insertThread = db.prepare(
    `INSERT INTO threads (id, page_id, project_id, status, anchor_exact, anchor_prefix, anchor_suffix, anchor_offset, recipients, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const insertMessage = db.prepare(
    'INSERT INTO messages (id, thread_id, author, body, at, edited_at) VALUES (?, ?, ?, ?, ?, ?)',
  )

  const summary: ImportSummary = {
    projects: 0,
    pages: 0,
    deletedPages: 0,
    versions: 0,
    threads: 0,
  }
  db.transaction(() => {
    const slugs = new Set<string>()
    for (const project of projects) {
      let slug = slugify(project.name)
      for (let n = 2; slugs.has(slug); n++) slug = `${slugify(project.name)}-${n}`
      slugs.add(slug)
      insertProject.run(project.id, project.name, project.description, slug, project.createdAt)
      summary.projects += 1
    }
    for (const page of pages) {
      const last = page.versions.at(-1)
      if (!last) continue
      const first = page.versions[0]!
      for (const version of page.versions) {
        insertVersion.run(
          newId(),
          page.id,
          page.projectId,
          version.kind,
          version.title,
          JSON.stringify(version.tags),
          version.body,
          revisionOf(version),
          version.actor,
          version.summary,
          version.createdAt,
          version.updatedAt,
        )
        summary.versions += 1
      }
      if (page.deletedAt) {
        insertVersion.run(
          newId(),
          page.id,
          page.projectId,
          'delete',
          last.title,
          JSON.stringify(last.tags),
          last.body,
          revisionOf(last),
          last.actor,
          last.title,
          page.deletedAt,
          page.deletedAt,
        )
        summary.deletedPages += 1
      } else {
        summary.pages += 1
      }
      insertPage.run(
        page.id,
        page.projectId,
        last.title,
        slugify(last.title),
        last.body,
        JSON.stringify(last.tags),
        revisionOf(last),
        excerptOf(last.body),
        first.createdAt,
        page.deletedAt ?? last.updatedAt,
        last.actor,
        page.deletedAt,
      )
    }
    for (const { pageId, projectId, thread } of threads) {
      insertThread.run(
        thread.id,
        pageId,
        projectId,
        thread.status,
        thread.anchor?.exact ?? null,
        thread.anchor?.prefix ?? null,
        thread.anchor?.suffix ?? null,
        thread.anchor?.offset ?? null,
        JSON.stringify(thread.to),
        thread.messages[0]?.at ?? new Date().toISOString(),
      )
      for (const message of thread.messages) {
        insertMessage.run(
          message.id,
          thread.id,
          message.author,
          message.body,
          message.at,
          message.editedAt ?? null,
        )
      }
      summary.threads += 1
    }
  })()
  return summary
}

export async function importLegacyRepo(
  db: Database.Database,
  repoDir: string,
  log: Log,
): Promise<ImportSummary | null> {
  if (!existsSync(join(repoDir, '.git'))) return null
  const { n } = db.prepare('SELECT count(*) AS n FROM page_versions').get() as { n: number }
  if (n > 0) {
    log(`${repoDir} still exists but its pages were already imported; it can be deleted.`)
    return null
  }
  log(`Importing pages and history from the git repository at ${repoDir}`)
  const summary = await importGitRepo(db, repoDir, log)
  const aside = `${repoDir}.imported-${new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15)}`
  await fs.rename(repoDir, aside)
  log(
    `Imported ${summary.projects} projects, ${summary.pages} pages (${summary.deletedPages} deleted), ` +
      `${summary.versions} versions and ${summary.threads} threads. The repository was moved to ${aside}.`,
  )
  return summary
}
