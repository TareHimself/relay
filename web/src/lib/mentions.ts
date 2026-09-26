import type { Person } from '@shared/accounts'

export interface ActiveMention {
  start: number
  end: number
  query: string
}

const TRAILING_MENTION = /(^|\s)@([a-z0-9_-]{0,32})$/i

export function activeMention(text: string, caret: number): ActiveMention | null {
  const match = TRAILING_MENTION.exec(text.slice(0, caret))
  if (!match) return null
  const query = match[2] ?? ''
  const start = caret - query.length - 1
  return { start, end: caret, query }
}

export function suggestPeople(
  people: readonly Person[],
  query: string,
  exclude: string | undefined,
  limit = 6,
): Person[] {
  const needle = query.toLowerCase()
  const rank = (person: Person): number => {
    const handle = person.handle.toLowerCase()
    const name = person.displayName.toLowerCase()
    if (handle.startsWith(needle)) return 0
    if (name.startsWith(needle)) return 1
    if (handle.includes(needle) || name.includes(needle)) return 2
    return 3
  }
  return people
    .filter((person) => person.handle !== exclude && rank(person) < 3)
    .sort((a, b) => rank(a) - rank(b) || a.handle.localeCompare(b.handle))
    .slice(0, limit)
}

export function insertMention(
  text: string,
  mention: ActiveMention,
  handle: string,
): { text: string; caret: number } {
  const after = text.slice(mention.end)
  const spacer = after.startsWith(' ') ? '' : ' '
  const inserted = `@${handle}${spacer}`
  return {
    text: text.slice(0, mention.start) + inserted + after,
    caret: mention.start + inserted.length + (spacer ? 0 : 1),
  }
}
