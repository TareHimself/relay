import type { EditorState } from '@codemirror/state'

export interface LinkDraft {
  from: number
  to: number
  label: string
  url: string
  editing: boolean
}

const UNSAFE_SCHEME = /^(javascript|data|vbscript):/i
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i
const RELATIVE = /^(#|\/|\.\.?\/)/
const EMAIL = /^[^@\s/]+@[^@\s/]+\.[^@\s/]+$/
const MARKDOWN_LINK = /\[([^\]]*)\]\(([^)\s]*)\)/g

export function normalizeLink(input: string): string | null {
  const raw = input.trim()
  if (!raw || UNSAFE_SCHEME.test(raw)) return null
  let url = raw
  if (!HAS_SCHEME.test(raw) && !RELATIVE.test(raw)) {
    url = EMAIL.test(raw) ? `mailto:${raw}` : `https://${raw}`
  }
  return url.replace(/ /g, '%20').replace(/\(/g, '%28').replace(/\)/g, '%29')
}

export function linkAt(
  lineText: string,
  from: number,
  to: number,
): { from: number; to: number; label: string; url: string } | null {
  for (const match of lineText.matchAll(MARKDOWN_LINK)) {
    const start = match.index
    const end = start + match[0].length
    if (lineText[start - 1] === '!') continue
    if (from >= start && to <= end) {
      return { from: start, to: end, label: match[1] ?? '', url: match[2] ?? '' }
    }
  }
  return null
}

export function linkMarkdown(label: string, url: string): string {
  return `[${label.replace(/[[\]]/g, '')}](${url})`
}

export function linkDraftFromSelection(state: EditorState): LinkDraft {
  const { from, to } = state.selection.main
  const line = state.doc.lineAt(from)
  const existing = to <= line.to ? linkAt(line.text, from - line.from, to - line.from) : null
  if (existing) {
    return {
      from: line.from + existing.from,
      to: line.from + existing.to,
      label: existing.label,
      url: existing.url,
      editing: true,
    }
  }
  const label = state.sliceDoc(from, to)
  return { from, to, label, url: /^https?:\/\/\S+$/i.test(label) ? label : '', editing: false }
}
