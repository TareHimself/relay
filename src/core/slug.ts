import { StoreError } from './errors'

export function slugify(title: string): string {
  const slug = title
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  if (!slug) throw new StoreError('invalid', 'Title must contain letters or numbers')
  return slug.slice(0, 80).replace(/-$/, '')
}
