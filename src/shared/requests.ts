import { z } from 'zod'
import { MAX_TAGS } from './tags'
import { threadStatusSchema } from './threads'

export const projectInput = z.object({
  name: z.string().trim().min(1),
  description: z.string().default(''),
})
export const renameProjectInput = z.object({ name: z.string().trim().min(1) })
export const renamePageInput = z.object({
  title: z.string().trim().min(1),
  ifRevision: z.string().optional(),
})
export const pageInput = z.object({
  title: z.string().trim().min(1),
  body: z.string().default(''),
  tags: z.array(z.string()).max(MAX_TAGS).default([]),
})
export const editInput = z.object({
  ifRevision: z.string().optional(),
  edits: z
    .array(
      z.union([
        z.object({ find: z.string().min(1), replace: z.string() }),
        z.object({ section: z.string().min(1), replace: z.string() }),
      ]),
    )
    .min(1)
    .optional(),
  body: z.string().optional(),
})
export const saveInput = z.object({ body: z.string(), ifRevision: z.string().min(1) })
export const threadInput = z.object({
  body: z.string().trim().min(1),
  anchorText: z.string().min(1).optional(),
  context: z.object({ prefix: z.string(), suffix: z.string() }).optional(),
  to: z.array(z.string().min(1)).optional(),
})
export const replyInput = z.object({ body: z.string().trim().min(1) })
export const restoreInput = z.object({
  hash: z.string().min(7),
  ifRevision: z.string().min(1),
})

export const threadFilter = z.object({
  projectId: z.string().optional(),
  to: z.string().optional(),
  status: threadStatusSchema.optional(),
})

export const eventsQuery = z.object({
  since: z.string().optional(),
  types: z
    .string()
    .optional()
    .transform((value) => value?.split(',').filter(Boolean)),
  projectId: z.string().optional(),
  excludeActor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
})

export type ProjectInput = z.input<typeof projectInput>
export type PageInput = z.input<typeof pageInput>
export type SaveInput = z.input<typeof saveInput>
export type ThreadInput = z.input<typeof threadInput>
export type ReplyInput = z.input<typeof replyInput>
