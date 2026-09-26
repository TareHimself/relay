import { z } from 'zod'

export const projectSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
})
export const PAGE_STATUSES = ['draft', 'published'] as const
export const pageStatusSchema = z.enum(PAGE_STATUSES)

export const pageSummarySchema = z.object({
  id: z.string(),
  projectId: z.string(),
  title: z.string(),
  path: z.string(),
  revision: z.string(),
  excerpt: z.string(),
  updatedAt: z.string(),
  tags: z.array(z.string()),
  status: pageStatusSchema,
})
export const pageSchema = pageSummarySchema.extend({ body: z.string() })

export type PageStatus = z.infer<typeof pageStatusSchema>
export type Project = z.infer<typeof projectSchema>
export type PageSummary = z.infer<typeof pageSummarySchema>
export type Page = z.infer<typeof pageSchema>

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
