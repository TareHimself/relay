import { z } from 'zod'

export const projectSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
})
export const pageSummarySchema = z.object({
  id: z.string(),
  projectId: z.string(),
  title: z.string(),
  url: z.string(),
  revision: z.string(),
  excerpt: z.string(),
  updatedAt: z.string(),
  tags: z.array(z.string()),
})
export const pageSchema = pageSummarySchema.extend({ body: z.string() })

export function docHref(pageId: string): string {
  return `/doc/${pageId}`
}

export type Project = z.infer<typeof projectSchema>
export type PageSummary = z.infer<typeof pageSummarySchema>
export type Page = z.infer<typeof pageSchema>

// Internal-only: the store's own representation, with the git file path
// attached. Never sent over the wire - callers get `url` instead, which
// works as a link; `path` is meaningless off the filesystem/git repo.
export interface StoredPageSummary extends PageSummary {
  path: string
}
export interface StoredPage extends Page {
  path: string
}

export interface OutlineEntry {
  text: string
  level: number
  id: string
}

export interface StoreEvent {
  id: string
  type: string
  at: string
  actor: string
  projectId: string
  pageId?: string | undefined
  threadId?: string | undefined
  revision?: string | undefined
  summary?: string | undefined
}

export interface IndexProblem {
  path: string
  reason: string
}
