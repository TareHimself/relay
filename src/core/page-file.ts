import YAML from 'yaml'
import { splitFrontmatter } from '../shared/frontmatter'
import { PAGE_STATUSES, type PageStatus } from '../shared/pages'
import { StoreError } from './errors'
import { tagsOf } from './tags'

const HEAD = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/
const RESERVED_KEYS = ['id', 'title', 'status', 'tags']

export interface PageFile {
  id: string
  title: string
  status: PageStatus
  tags: string[]
  body: string
}

function statusOf(value: unknown): PageStatus {
  return PAGE_STATUSES.find((status) => status === value) ?? 'draft'
}

function mappingOf(source: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = YAML.parse(source)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

export function parsePageFile(markdown: string): PageFile {
  const match = HEAD.exec(markdown)
  if (!match) throw new StoreError('invalid', 'Page requires YAML frontmatter')
  const parsed = mappingOf(match[1] ?? '') ?? {}
  if (typeof parsed.id !== 'string' || typeof parsed.title !== 'string')
    throw new StoreError('invalid', 'Page requires id and title')
  return {
    id: parsed.id,
    title: parsed.title,
    status: statusOf(parsed.status),
    tags: tagsOf(parsed.tags),
    body: splitFrontmatter(markdown).body,
  }
}

export function withFrontmatter(
  markdown: string,
  changes: { status?: PageStatus; tags?: readonly string[] },
): string {
  const match = HEAD.exec(markdown)
  if (!match) return markdown
  const document = YAML.parseDocument(match[1] ?? '')
  if (changes.status !== undefined) document.set('status', changes.status)
  if (changes.tags !== undefined) document.set('tags', [...changes.tags])
  return `---\n${document.toString().trimEnd()}\n---\n${markdown.slice(match[0].length)}`
}

export function withBody(markdown: string, body: string): string {
  return splitFrontmatter(markdown).head + body
}

function startsWithFrontmatter(body: string): boolean {
  const match = HEAD.exec(body)
  const mapping = match ? mappingOf(match[1] ?? '') : null
  return mapping !== null && RESERVED_KEYS.some((key) => key in mapping)
}

export function assertNoFrontmatter(next: string, previous = ''): void {
  if (startsWithFrontmatter(next) && !startsWithFrontmatter(previous)) {
    throw new StoreError(
      'invalid',
      'The body must not start with YAML frontmatter. Relay keeps id, title, status and tags itself: ' +
        'pass status and tags as parameters and send only the markdown body.',
    )
  }
}
