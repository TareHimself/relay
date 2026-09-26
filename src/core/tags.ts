import { normalizeTags } from '../shared/tags'

export function tagsOf(frontmatter: unknown): string[] {
  return Array.isArray(frontmatter)
    ? normalizeTags(frontmatter.filter((tag): tag is string => typeof tag === 'string'))
    : []
}
