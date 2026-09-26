import type { z } from 'zod'

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details: unknown

  constructor(message: string, status: number, code: string, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

async function call<T>(
  method: Method,
  path: string,
  schema: z.ZodType<T>,
  body?: unknown,
): Promise<T> {
  const init: RequestInit = { method }
  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' }
    init.body = JSON.stringify(body)
  }
  const response = await fetch(`/api${path}`, init)
  const payload: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const failure = (payload ?? {}) as { error?: string; message?: string; details?: unknown }
    throw new ApiError(
      failure.message ?? `Request failed (${response.status})`,
      response.status,
      failure.error ?? 'error',
      failure.details,
    )
  }
  return schema.parse(payload)
}

export const http = {
  get: <T>(path: string, schema: z.ZodType<T>) => call('GET', path, schema),
  post: <T>(path: string, schema: z.ZodType<T>, body?: unknown) => call('POST', path, schema, body),
  put: <T>(path: string, schema: z.ZodType<T>, body?: unknown) => call('PUT', path, schema, body),
  patch: <T>(path: string, schema: z.ZodType<T>, body?: unknown) =>
    call('PATCH', path, schema, body),
  delete: <T>(path: string, schema: z.ZodType<T>) => call('DELETE', path, schema),
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
