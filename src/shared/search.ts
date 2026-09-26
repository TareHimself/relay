import { z } from 'zod'

export const searchKindSchema = z.enum(['page', 'thread', 'project'])

export const searchHitSchema = z.object({
  kind: searchKindSchema,
  id: z.string(),
  pageId: z.string().nullable(),
  projectId: z.string(),
  title: z.string(),
  snippet: z.string(),
})

export const searchQuery = z.object({
  q: z.string().default(''),
  projectId: z.string().optional(),
  kinds: z
    .string()
    .optional()
    .transform((value) => value?.split(',').filter(Boolean)),
  limit: z.coerce.number().int().min(1).max(50).optional(),
})

export type SearchKind = z.infer<typeof searchKindSchema>
export type SearchHit = z.infer<typeof searchHitSchema>
