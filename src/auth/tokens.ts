import { createHash, randomBytes } from 'node:crypto'
import { and, eq, isNull } from 'drizzle-orm'
import { StoreError } from '../core/errors'
import { newId } from '../core/ids'
import type { Orm } from '../db/orm'
import * as schema from '../db/schema'
import { tokenInput, type CreatedToken, type TokenInput, type TokenRecord } from '../shared/tokens'
import type { AuthContext } from './context'

const TOUCH_INTERVAL_MS = 60_000
const RESERVED_NAMES = new Set(['local', 'admin', 'system'])

function hashOf(secret: string): string {
  return createHash('sha256').update(secret).digest('hex')
}

function toRecord(row: typeof schema.tokens.$inferSelect): TokenRecord {
  return {
    id: row.id,
    name: row.name,
    scope: row.scope,
    projectId: row.projectId,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
    expiresAt: row.expiresAt,
  }
}

export class TokenService {
  constructor(private readonly orm: Orm) {}

  create(input: TokenInput): CreatedToken {
    const { name, scope, projectId, expiresAt } = tokenInput.parse(input)
    if (RESERVED_NAMES.has(name)) throw new StoreError('invalid', `"${name}" is a reserved name`)
    const user = this.orm
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.handle, name))
      .get()
    if (user) throw new StoreError('conflict', `"${name}" is already a person's handle`)
    const taken = this.orm
      .select({ id: schema.tokens.id })
      .from(schema.tokens)
      .where(and(eq(schema.tokens.name, name), isNull(schema.tokens.revokedAt)))
      .get()
    if (taken) throw new StoreError('conflict', `A token named "${name}" already exists`)
    if (projectId) {
      const project = this.orm
        .select({ id: schema.projects.id })
        .from(schema.projects)
        .where(eq(schema.projects.id, projectId))
        .get()
      if (!project) throw new StoreError('not_found', 'Project not found')
    }
    const secret = `rly_${randomBytes(32).toString('base64url')}`
    const row = {
      id: newId(),
      name,
      hash: hashOf(secret),
      scope,
      projectId: projectId ?? null,
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
      expiresAt: expiresAt ?? null,
      revokedAt: null,
    }
    this.orm.insert(schema.tokens).values(row).run()
    return { ...toRecord(row), token: secret }
  }

  list(): TokenRecord[] {
    return this.orm
      .select()
      .from(schema.tokens)
      .where(isNull(schema.tokens.revokedAt))
      .orderBy(schema.tokens.id)
      .all()
      .map(toRecord)
  }

  revoke(id: string): void {
    const result = this.orm
      .update(schema.tokens)
      .set({ revokedAt: new Date().toISOString() })
      .where(and(eq(schema.tokens.id, id), isNull(schema.tokens.revokedAt)))
      .run()
    if (result.changes === 0) throw new StoreError('not_found', 'Token not found')
  }

  authenticate(secret: string): AuthContext | null {
    const row = this.orm
      .select()
      .from(schema.tokens)
      .where(eq(schema.tokens.hash, hashOf(secret)))
      .get()
    if (!row || row.revokedAt) return null
    const now = Date.now()
    if (row.expiresAt && Date.parse(row.expiresAt) <= now) return null
    if (!row.lastUsedAt || now - Date.parse(row.lastUsedAt) > TOUCH_INTERVAL_MS) {
      this.orm
        .update(schema.tokens)
        .set({ lastUsedAt: new Date(now).toISOString() })
        .where(eq(schema.tokens.id, row.id))
        .run()
    }
    return { kind: 'token', actor: row.name, scope: row.scope, projectId: row.projectId }
  }
}
