import { createHash } from 'node:crypto'
import { StoreError } from './errors'
import { replaceSection } from './sections'

export type TextEdit = { find: string; replace: string } | { section: string; replace: string }

export function revisionOf(markdown: string): string {
  return createHash('sha256').update(markdown).digest('hex')
}

export function locateUnique(text: string, find: string): number {
  if (!find) throw new StoreError('invalid', 'Text to find cannot be empty')
  const first = text.indexOf(find)
  if (first < 0) throw new StoreError('conflict', 'Target text has changed', { current: text })
  if (text.indexOf(find, first + find.length) >= 0) {
    throw new StoreError('ambiguous', 'Target text occurs more than once', { current: text })
  }
  return first
}

export function applyEdits(markdown: string, edits: readonly TextEdit[]): string {
  if (edits.length === 0) throw new StoreError('invalid', 'At least one edit is required')
  let result = markdown
  for (const edit of edits) {
    if ('section' in edit) {
      result = replaceSection(result, edit.section, edit.replace)
      continue
    }
    const first = locateUnique(result, edit.find)
    result = result.slice(0, first) + edit.replace + result.slice(first + edit.find.length)
  }
  return result
}
