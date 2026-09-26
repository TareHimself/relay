import { z } from 'zod'

const anchorSchema = z.object({
  exact: z.string().min(1),
  prefix: z.string(),
  suffix: z.string(),
  offset: z.number().int().nonnegative(),
})
const messageSchema = z.object({
  id: z.string(),
  author: z.string(),
  body: z.string(),
  at: z.string(),
  editedAt: z.string().optional(),
})
export const threadStatusSchema = z.enum(['open', 'answered', 'resolved'])
export const threadSchema = z.object({
  id: z.string(),
  anchor: anchorSchema.optional(),
  status: threadStatusSchema,
  to: z.array(z.string()),
  messages: z.array(messageSchema).min(1),
})
export const threadFileSchema = z.object({ threads: z.array(threadSchema) })

export type Anchor = z.infer<typeof anchorSchema>
export type Message = z.infer<typeof messageSchema>
export type Thread = z.infer<typeof threadSchema>
export type ThreadStatus = z.infer<typeof threadStatusSchema>
