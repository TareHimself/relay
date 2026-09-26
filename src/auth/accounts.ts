import { createHash, randomBytes } from 'node:crypto'
import { and, eq, isNull, lt, ne } from 'drizzle-orm'
import { StoreError } from '../core/errors'
import { newId } from '../core/ids'
import type { Orm } from '../db/orm'
import * as schema from '../db/schema'
import { displayNameSchema, handleSchema, type SessionRecord } from '../shared/accounts'
import { assertPasswordStrength, hashPassword, verifyPassword } from './password'

const SESSION_MS = 30 * 24 * 60 * 60 * 1000
const TOUCH_MS = 60 * 60 * 1000
const RESERVED_HANDLES = new Set(['local', 'system'])

export interface UserRecord {
  id: string
  handle: string
  displayName: string
  role: 'admin'
  createdAt: string
}

export interface BootstrapInput {
  handle: string
  displayName?: string | undefined
  password: string
}

function hashOf(secret: string): string {
  return createHash('sha256').update(secret).digest('hex')
}

function toUser(row: typeof schema.users.$inferSelect): UserRecord {
  return {
    id: row.id,
    handle: row.handle,
    displayName: row.displayName,
    role: row.role,
    createdAt: row.createdAt,
  }
}

export class AccountService {
  constructor(private readonly orm: Orm) {}

  private adminRow() {
    return this.orm.select().from(schema.users).where(eq(schema.users.role, 'admin')).get()
  }

  hasAdmin(): boolean {
    return this.adminRow() !== undefined
  }

  admin(): UserRecord | null {
    const row = this.adminRow()
    return row ? toUser(row) : null
  }

  async bootstrapAdmin(input: BootstrapInput): Promise<UserRecord> {
    if (this.hasAdmin()) throw new StoreError('conflict', 'An admin account already exists')
    const handle = handleSchema.parse(input.handle)
    if (RESERVED_HANDLES.has(handle)) throw new StoreError('invalid', `"${handle}" is reserved`)
    const displayName = displayNameSchema.parse(input.displayName ?? handle)
    const agent = this.orm
      .select({ id: schema.tokens.id })
      .from(schema.tokens)
      .where(and(eq(schema.tokens.name, handle), isNull(schema.tokens.revokedAt)))
      .get()
    if (agent) throw new StoreError('conflict', `An API token is already named "${handle}"`)
    const row = {
      id: newId(),
      handle,
      displayName,
      passwordHash: await hashPassword(input.password),
      role: 'admin' as const,
      createdAt: new Date().toISOString(),
    }
    this.orm.insert(schema.users).values(row).run()
    return toUser(row)
  }

  async login(
    password: string,
    userAgent: string,
  ): Promise<{ secret: string; sessionId: string; user: UserRecord } | null> {
    const row = this.adminRow()
    if (!row || !(await verifyPassword(password, row.passwordHash))) return null
    const now = Date.now()
    this.orm
      .delete(schema.sessions)
      .where(lt(schema.sessions.expiresAt, new Date(now).toISOString()))
      .run()
    const secret = randomBytes(32).toString('base64url')
    const at = new Date(now).toISOString()
    this.orm
      .insert(schema.sessions)
      .values({
        id: hashOf(secret),
        userId: row.id,
        createdAt: at,
        lastSeenAt: at,
        expiresAt: new Date(now + SESSION_MS).toISOString(),
        userAgent: userAgent.slice(0, 200),
      })
      .run()
    return { secret, sessionId: hashOf(secret), user: toUser(row) }
  }

  authenticate(secret: string): { user: UserRecord; sessionId: string } | null {
    const id = hashOf(secret)
    const session = this.orm.select().from(schema.sessions).where(eq(schema.sessions.id, id)).get()
    if (!session) return null
    const now = Date.now()
    if (Date.parse(session.expiresAt) <= now) return null
    const user = this.orm
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, session.userId))
      .get()
    if (!user) return null
    if (now - Date.parse(session.lastSeenAt) > TOUCH_MS) {
      this.orm
        .update(schema.sessions)
        .set({
          lastSeenAt: new Date(now).toISOString(),
          expiresAt: new Date(now + SESSION_MS).toISOString(),
        })
        .where(eq(schema.sessions.id, id))
        .run()
    }
    return { user: toUser(user), sessionId: id }
  }

  logout(secret: string): void {
    this.orm
      .delete(schema.sessions)
      .where(eq(schema.sessions.id, hashOf(secret)))
      .run()
  }

  listSessions(currentSessionId?: string): SessionRecord[] {
    return this.orm
      .select()
      .from(schema.sessions)
      .orderBy(schema.sessions.createdAt)
      .all()
      .filter((session) => Date.parse(session.expiresAt) > Date.now())
      .map((session) => ({
        id: session.id,
        createdAt: session.createdAt,
        lastSeenAt: session.lastSeenAt,
        expiresAt: session.expiresAt,
        userAgent: session.userAgent,
        current: session.id === currentSessionId,
      }))
  }

  revokeSession(sessionId: string): void {
    const result = this.orm.delete(schema.sessions).where(eq(schema.sessions.id, sessionId)).run()
    if (result.changes === 0) throw new StoreError('not_found', 'Session not found')
  }

  async changePassword(current: string, next: string, keepSessionId?: string): Promise<void> {
    const row = this.adminRow()
    if (!row || !(await verifyPassword(current, row.passwordHash))) {
      throw new StoreError('forbidden', 'Current password is incorrect')
    }
    await this.replacePassword(row.id, next, keepSessionId)
  }

  async resetPassword(next: string): Promise<void> {
    const row = this.adminRow()
    if (!row) throw new StoreError('not_found', 'No admin account exists')
    await this.replacePassword(row.id, next)
  }

  private async replacePassword(
    userId: string,
    next: string,
    keepSessionId?: string,
  ): Promise<void> {
    assertPasswordStrength(next)
    this.orm
      .update(schema.users)
      .set({ passwordHash: await hashPassword(next) })
      .where(eq(schema.users.id, userId))
      .run()
    this.orm
      .delete(schema.sessions)
      .where(
        keepSessionId
          ? and(eq(schema.sessions.userId, userId), ne(schema.sessions.id, keepSessionId))
          : eq(schema.sessions.userId, userId),
      )
      .run()
  }

  setDisplayName(displayName: string): UserRecord {
    const row = this.adminRow()
    if (!row) throw new StoreError('not_found', 'No admin account exists')
    const name = displayNameSchema.parse(displayName)
    this.orm
      .update(schema.users)
      .set({ displayName: name })
      .where(eq(schema.users.id, row.id))
      .run()
    return toUser({ ...row, displayName: name })
  }

  users(): UserRecord[] {
    return this.orm.select().from(schema.users).all().map(toUser)
  }

  displayNameOf(handle: string): string | undefined {
    return this.orm
      .select({ displayName: schema.users.displayName })
      .from(schema.users)
      .where(eq(schema.users.handle, handle))
      .get()?.displayName
  }

  handleTaken(handle: string): boolean {
    return (
      RESERVED_HANDLES.has(handle) ||
      this.orm
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.handle, handle))
        .get() !== undefined
    )
  }
}
