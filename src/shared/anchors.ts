import type { Anchor } from './threads'

export interface TextRange {
  from: number
  to: number
}

export function commonSuffixLength(a: string, b: string): number {
  let length = 0
  while (
    length < a.length &&
    length < b.length &&
    a[a.length - 1 - length] === b[b.length - 1 - length]
  )
    length++
  return length
}

export function commonPrefixLength(a: string, b: string): number {
  let length = 0
  while (length < a.length && length < b.length && a[length] === b[length]) length++
  return length
}

function occurrences(text: string, find: string): number[] {
  const found: number[] = []
  if (!find) return found
  for (let at = text.indexOf(find); at >= 0; at = text.indexOf(find, at + 1)) found.push(at)
  return found
}

function contextScore(
  text: string,
  offset: number,
  exact: string,
  context: Pick<Anchor, 'prefix' | 'suffix'>,
): number {
  return (
    commonSuffixLength(text.slice(0, offset), context.prefix) +
    commonPrefixLength(text.slice(offset + exact.length), context.suffix)
  )
}

export function resolveAnchor(
  text: string,
  anchor: Pick<Anchor, 'exact' | 'prefix' | 'suffix'>,
  hint: number,
): TextRange | null {
  const ranked = occurrences(text, anchor.exact)
    .map((from) => ({
      from,
      score: contextScore(text, from, anchor.exact, anchor),
      distance: Math.abs(from - hint),
    }))
    .sort((a, b) => b.score - a.score || a.distance - b.distance)
  const best = ranked[0]
  return best ? { from: best.from, to: best.from + anchor.exact.length } : null
}
