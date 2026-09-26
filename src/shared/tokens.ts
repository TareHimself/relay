import { z } from 'zod'

export const HANDLE_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/

export const tokenScopeSchema = z.enum(['read', 'write'])

export const tokenRecordSchema = z.object({
  id: z.string(),
  name: z.string(),
  scope: tokenScopeSchema,
  projectId: z.string().nullable(),
  createdAt: z.string(),
  lastUsedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
})
export const createdTokenSchema = tokenRecordSchema.extend({ token: z.string() })

export const tokenInput = z.object({
  name: z
    .string()
    .trim()
    .toLowerCase()
    .regex(HANDLE_PATTERN, 'Use 1-32 lowercase letters, numbers, dashes or underscores'),
  scope: tokenScopeSchema.default('write'),
  projectId: z.string().min(1).optional(),
  expiresAt: z.iso.datetime().optional(),
})

export type TokenScope = z.infer<typeof tokenScopeSchema>
export type TokenRecord = z.infer<typeof tokenRecordSchema>
export type CreatedToken = z.infer<typeof createdTokenSchema>
export type TokenInput = z.input<typeof tokenInput>
