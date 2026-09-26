import { z } from 'zod'

export const MAX_TAGS = 20
const MAX_TAG_LENGTH = 40

export function normalizeTag(input: string): string | null {
  const segments = input
    .toLowerCase()
    .split('/')
    .map((segment) =>
      segment
        .trim()
        .replace(/[^\p{L}\p{N}._-]+/gu, '-')
        .replace(/^[-.]+|[-.]+$/g, ''),
    )
    .filter(Boolean)
  const tag = segments.join('/')
  return tag === '' || tag.length > MAX_TAG_LENGTH ? null : tag
}

export function normalizeTags(input: readonly string[]): string[] {
  const seen = new Set<string>()
  for (const raw of input) {
    const tag = normalizeTag(raw)
    if (tag) seen.add(tag)
  }
  return [...seen].slice(0, MAX_TAGS)
}

export function hasTag(tags: readonly string[], wanted: string): boolean {
  return tags.some((tag) => tag === wanted || tag.startsWith(`${wanted}/`))
}

export const tagsInput = z.object({
  tags: z.array(z.string()).max(MAX_TAGS),
  ifRevision: z.string().optional(),
})

export const tagCountSchema = z.object({ tag: z.string(), count: z.number() })
export type TagCount = z.infer<typeof tagCountSchema>
