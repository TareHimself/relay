import type Database from 'better-sqlite3'
import type { Thread } from '../core/threads'
import type { Project } from '../shared/pages'
import type { SearchHit, SearchKind } from '../shared/search'
import { normalizeTag } from '../shared/tags'

export const MARK_START = '\u0001'
export const MARK_END = '\u0002'

interface IndexedPage {
  id: string
  projectId: string
  title: string
  body: string
}

interface Row {
  kind: SearchKind
  id: string
  page_id: string | null
  project_id: string
  title: string
  snippet: string
}

export function matchExpression(query: string): string | null {
  const words = query.match(/[\p{L}\p{N}]+/gu)
  if (!words || words.length === 0) return null
  return words.map((word, index) => `"${word}"${index === words.length - 1 ? '*' : ''}`).join(' ')
}

export function splitTagFilters(query: string): { text: string; tags: string[] } {
  const tags: string[] = []
  const text = query.replace(/(^|\s)tag:(\S+)/gi, (_whole, lead: string, raw: string) => {
    const tag = normalizeTag(raw)
    if (tag) tags.push(tag)
    return lead
  })
  return { text, tags }
}

export function bodyOf(markdown: string): string {
  return markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '')
}

function threadText(thread: Thread): string {
  return [thread.anchor?.exact ?? '', ...thread.messages.map((message) => message.body)]
    .filter(Boolean)
    .join('\n')
}

export class SearchIndex {
  constructor(private readonly db: Database.Database) {}

  rebuild(
    projects: readonly Project[],
    pages: ReadonlyArray<{ page: IndexedPage; threads: readonly Thread[] }>,
  ): void {
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM search_index').run()
      for (const project of projects) this.insertProject(project)
      for (const { page, threads } of pages) {
        this.insertPage(page)
        for (const thread of threads) this.insertThread(page, thread)
      }
    })()
  }

  setProject(project: Project): void {
    this.db.transaction(() => {
      this.db.prepare("DELETE FROM search_index WHERE kind = 'project' AND id = ?").run(project.id)
      this.insertProject(project)
    })()
  }

  setPage(page: IndexedPage): void {
    this.db.transaction(() => {
      this.db.prepare("DELETE FROM search_index WHERE kind = 'page' AND id = ?").run(page.id)
      this.insertPage(page)
      this.db
        .prepare("UPDATE search_index SET title = ? WHERE kind = 'thread' AND page_id = ?")
        .run(page.title, page.id)
    })()
  }

  setThreads(page: Omit<IndexedPage, 'body'>, threads: readonly Thread[]): void {
    this.db.transaction(() => {
      this.db.prepare("DELETE FROM search_index WHERE kind = 'thread' AND page_id = ?").run(page.id)
      for (const thread of threads) this.insertThread(page, thread)
    })()
  }

  removePage(pageId: string): void {
    this.db.prepare('DELETE FROM search_index WHERE page_id = ? OR id = ?').run(pageId, pageId)
  }

  query(input: {
    query: string
    projectId?: string | undefined
    kinds?: readonly SearchKind[] | undefined
    limit?: number | undefined
  }): SearchHit[] {
    const { text, tags } = splitTagFilters(input.query)
    const match = matchExpression(text)
    if (!match && tags.length === 0) return []
    const limit = Math.min(Math.max(input.limit ?? 20, 1), 50)
    const filters: string[] = []
    const params: unknown[] = match ? [match] : []
    if (input.projectId) {
      filters.push('AND project_id = ?')
      params.push(input.projectId)
    }
    if (input.kinds && input.kinds.length > 0) {
      filters.push(`AND kind IN (${input.kinds.map(() => '?').join(', ')})`)
      params.push(...input.kinds)
    }
    for (const tag of tags) {
      filters.push(
        `AND page_id IN (SELECT pages.id FROM pages, json_each(pages.tags)
           WHERE json_each.value = ? OR substr(json_each.value, 1, length(?) + 1) = ? || '/')`,
      )
      params.push(tag, tag, tag)
    }
    params.push(limit)
    const sql = match
      ? `SELECT kind, id, page_id, project_id, title,
                snippet(search_index, 5, '${MARK_START}', '${MARK_END}', '…', 16) AS snippet
         FROM search_index
         WHERE search_index MATCH ? ${filters.join(' ')}
         ORDER BY bm25(search_index, 0, 0, 0, 0, 8.0, 1.0)
         LIMIT ?`
      : `SELECT kind, id, page_id, project_id, title, '' AS snippet
         FROM search_index
         WHERE kind = 'page' ${filters.join(' ')}
         ORDER BY title
         LIMIT ?`
    const rows = this.db.prepare(sql).all(...params) as Row[]
    return rows.map((row) => ({
      kind: row.kind,
      id: row.id,
      pageId: row.page_id,
      projectId: row.project_id,
      title: row.title,
      snippet: row.snippet,
    }))
  }

  private insertProject(project: Project): void {
    this.db
      .prepare(
        "INSERT INTO search_index (kind, id, page_id, project_id, title, body) VALUES ('project', ?, NULL, ?, ?, ?)",
      )
      .run(project.id, project.id, project.name, project.description)
  }

  private insertPage(page: IndexedPage): void {
    this.db
      .prepare(
        "INSERT INTO search_index (kind, id, page_id, project_id, title, body) VALUES ('page', ?, ?, ?, ?, ?)",
      )
      .run(page.id, page.id, page.projectId, page.title, page.body)
  }

  private insertThread(page: Omit<IndexedPage, 'body'>, thread: Thread): void {
    this.db
      .prepare(
        "INSERT INTO search_index (kind, id, page_id, project_id, title, body) VALUES ('thread', ?, ?, ?, ?, ?)",
      )
      .run(thread.id, page.id, page.projectId, page.title, threadText(thread))
  }
}
