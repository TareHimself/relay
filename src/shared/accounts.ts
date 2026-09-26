import { z } from 'zod'
import { HANDLE_PATTERN, tokenScopeSchema } from './tokens'

export const displayNameSchema = z.string().trim().min(1, 'Name cannot be empty').max(60)
export const handleSchema = z.string().trim().toLowerCase().regex(HANDLE_PATTERN)

export const whoamiSchema = z.object({
  handle: z.string(),
  displayName: z.string(),
  scope: tokenScopeSchema,
  projectId: z.string().nullable(),
  kind: z.enum(['admin', 'token']),
  session: z.boolean(),
})

export const personSchema = z.object({
  handle: z.string(),
  displayName: z.string(),
  kind: z.enum(['user', 'agent']),
})

export const sessionRecordSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  lastSeenAt: z.string(),
  expiresAt: z.string(),
  userAgent: z.string(),
  current: z.boolean(),
})

export const MIN_PASSWORD_LENGTH = 8
export const MAX_PASSWORD_LENGTH = 200

export const loginInput = z.object({ password: z.string().min(1).max(MAX_PASSWORD_LENGTH) })
export const accountInput = z.object({ displayName: displayNameSchema })
export const passwordInput = z.object({
  current: z.string().min(1).max(MAX_PASSWORD_LENGTH),
  next: z.string().min(1).max(MAX_PASSWORD_LENGTH),
})

export type Whoami = z.infer<typeof whoamiSchema>
export type Person = z.infer<typeof personSchema>
export type SessionRecord = z.infer<typeof sessionRecordSchema>
