const MARK_START = '\u0001'
const MARK_END = '\u0002'

export interface SnippetPart {
  text: string
  match: boolean
}

export function splitSnippet(snippet: string): SnippetPart[] {
  const parts: SnippetPart[] = []
  let rest = snippet
  while (rest.length > 0) {
    const start = rest.indexOf(MARK_START)
    if (start === -1) {
      parts.push({ text: rest, match: false })
      break
    }
    if (start > 0) parts.push({ text: rest.slice(0, start), match: false })
    const end = rest.indexOf(MARK_END, start + 1)
    if (end === -1) {
      parts.push({ text: rest.slice(start + 1), match: false })
      break
    }
    parts.push({ text: rest.slice(start + 1, end), match: true })
    rest = rest.slice(end + 1)
  }
  return parts.filter((part) => part.text !== '')
}
