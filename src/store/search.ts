import type Database from 'better-sqlite3'
import type { SearchHit, SearchKind } from '../shared/search'
import { normalizeTag } from '../shared/tags'

export const MARK_START = '\u0001'
export const MARK_END = '\u0002'

interface Row {
  kind: SearchKind
  id: string
  page_id: string | null
  project_id: string
  title: string
  snippet: string
}

function words(query: string): string[] {
  return query.match(/[\p{L}\p{N}]+/gu) ?? []
}

export function matchExpression(query: string): string | null {
  const terms = words(query)
  if (terms.length === 0) return null
  return terms.map((word, index) => `"${word}"${index === terms.length - 1 ? '*' : ''}`).join(' ')
}

export function trigramExpression(query: string): string | null {
  const terms = words(query).filter((word) => word.length >= 3)
  if (terms.length === 0) return null
  return terms.map((word) => `"${word}"`).join(' ')
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

export class SearchIndex {
  constructor(private readonly db: Database.Database) {}

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
    const params: unknown[] = []
    if (input.projectId) {
      filters.push('AND d.project_id = ?')
      params.push(input.projectId)
    }
    if (input.kinds && input.kinds.length > 0) {
      filters.push(`AND d.kind IN (${input.kinds.map(() => '?').join(', ')})`)
      params.push(...input.kinds)
    }
    for (const tag of tags) {
      filters.push(
        `AND d.page_id IN (SELECT pages.id FROM pages, json_each(pages.tags)
           WHERE json_each.value = ? OR substr(json_each.value, 1, length(?) + 1) = ? || '/')`,
      )
      params.push(tag, tag, tag)
    }
    const where = filters.join(' ')
    if (!match) {
      const sql = `SELECT d.kind, d.id, d.page_id, d.project_id, d.title, '' AS snippet
         FROM search_docs d WHERE d.kind = 'page' ${where} ORDER BY d.title LIMIT ?`
      return (this.db.prepare(sql).all(...params, limit) as Row[]).map(hitOf)
    }
    const search = (table: string, expression: string) => {
      const sql = `SELECT d.kind, d.id, d.page_id, d.project_id, d.title,
                snippet(${table}, 1, '${MARK_START}', '${MARK_END}', '…', 16) AS snippet
         FROM ${table} JOIN search_docs d ON d.doc_id = ${table}.rowid
         WHERE ${table} MATCH ? ${where}
         ORDER BY bm25(${table}, 8.0, 1.0)
         LIMIT ?`
      return (this.db.prepare(sql).all(expression, ...params, limit) as Row[]).map(hitOf)
    }
    const hits = search('search_index', match)
    if (hits.length > 0) return hits
    const trigram = trigramExpression(text)
    return trigram ? search('search_trigram', trigram) : []
  }
}

function hitOf(row: Row): SearchHit {
  return {
    kind: row.kind,
    id: row.id,
    pageId: row.page_id,
    projectId: row.project_id,
    title: row.title,
    snippet: row.snippet,
  }
}
