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

export const versionKindSchema = z.enum(['create', 'edit', 'rename', 'tags', 'restore', 'delete'])
export const historyEntrySchema = z.object({
  id: z.string(),
  kind: versionKindSchema,
  actor: z.string(),
  summary: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export const pageVersionSchema = historyEntrySchema.extend({
  pageId: z.string(),
  title: z.string(),
  tags: z.array(z.string()),
  body: z.string(),
  revision: z.string(),
})

export function docHref(pageId: string): string {
  return `/doc/${pageId}`
}

export type Project = z.infer<typeof projectSchema>
export type PageSummary = z.infer<typeof pageSummarySchema>
export type Page = z.infer<typeof pageSchema>
export type VersionKind = z.infer<typeof versionKindSchema>
export type HistoryEntry = z.infer<typeof historyEntrySchema>
export type PageVersion = z.infer<typeof pageVersionSchema>

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
