import type { OutlineEntry } from '../shared/pages'
import { StoreError } from './errors'

interface Heading {
  level: number
  text: string
  start: number
  end: number
}

function headingsOf(markdown: string): Heading[] {
  const found: Heading[] = []
  let fence: string | null = null
  let offset = 0
  for (const line of markdown.split('\n')) {
    const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1]?.[0]
    if (marker) {
      fence = fence === null ? marker : fence === marker ? null : fence
    } else if (fence === null) {
      const match = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line)
      if (match?.[1] !== undefined && match[2] !== undefined) {
        found.push({
          level: match[1].length,
          text: match[2],
          start: offset,
          end: offset + line.replace(/\r$/, '').length,
        })
      }
    }
    offset += line.length + 1
  }
  return found
}

export function outlineOf(markdown: string): OutlineEntry[] {
  const used = new Map<string, number>()
  return headingsOf(markdown).map(({ level, text }) => {
    const base =
      text
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s-]/gu, '')
        .trim()
        .replace(/\s+/g, '-') || 'section'
    const seen = used.get(base) ?? 0
    used.set(base, seen + 1)
    return { text, level, id: seen === 0 ? base : `${base}-${seen}` }
  })
}

export function replaceSection(markdown: string, heading: string, replace: string): string {
  const wanted = heading.replace(/^#{1,6}\s*/, '').trim()
  if (!wanted) throw new StoreError('invalid', 'Section heading cannot be empty')
  const all = headingsOf(markdown)
  const matches = all.filter((candidate) => candidate.text === wanted)
  const target = matches[0]
  if (!target) {
    throw new StoreError('conflict', `Section "${wanted}" not found`, { current: markdown })
  }
  if (matches.length > 1) {
    throw new StoreError('ambiguous', `Section "${wanted}" occurs more than once`, {
      current: markdown,
    })
  }
  const next = all.find(
    (candidate) => candidate.start > target.start && candidate.level <= target.level,
  )
  const before = markdown.slice(0, target.end)
  const after = next ? markdown.slice(next.start) : ''
  const body = replace.replace(/^\n+|\n+$/g, '')
  if (!body) return `${before}\n${next ? '\n' : ''}${after}`
  return `${before}\n\n${body}\n${next ? '\n' : ''}${after}`
}
