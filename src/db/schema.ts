import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const operations = sqliteTable('operations', {
  id: text('id').primaryKey(),
  path: text('path').notNull(),
  expected: text('expected'),
  content: text('content').notNull(),
  actor: text('actor').notNull(),
  event: text('event').notNull(),
  deleted: integer('deleted', { mode: 'boolean' }).notNull().default(false),
  commitHash: text('commit_hash'),
  status: text('status', { enum: ['pending', 'complete', 'conflicted'] }).notNull(),
})

export const events = sqliteTable('events', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  at: text('at').notNull(),
  actor: text('actor').notNull(),
  projectId: text('project_id').notNull(),
  pageId: text('page_id'),
  threadId: text('thread_id'),
  revision: text('revision'),
  summary: text('summary'),
})

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  path: text('path').notNull().unique(),
})

export const threads = sqliteTable('threads', {
  id: text('id').primaryKey(),
  pageId: text('page_id').notNull(),
  projectId: text('project_id').notNull(),
  status: text('status', { enum: ['open', 'answered', 'resolved'] }).notNull(),
})

export const pages = sqliteTable('pages', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  title: text('title').notNull(),
  path: text('path').notNull().unique(),
  revision: text('revision').notNull(),
  excerpt: text('excerpt').notNull().default(''),
  updatedAt: text('updated_at').notNull().default(''),
  tags: text('tags', { mode: 'json' }).$type<string[]>().notNull().default([]),
  status: text('status', { enum: ['draft', 'published'] })
    .notNull()
    .default('draft'),
})

export const tokens = sqliteTable('tokens', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  hash: text('hash').notNull().unique(),
  scope: text('scope', { enum: ['read', 'write'] }).notNull(),
  projectId: text('project_id'),
  createdAt: text('created_at').notNull(),
  lastUsedAt: text('last_used_at'),
  expiresAt: text('expires_at'),
  revokedAt: text('revoked_at'),
})

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  handle: text('handle').notNull().unique(),
  displayName: text('display_name').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: ['admin'] }).notNull(),
  createdAt: text('created_at').notNull(),
})

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  createdAt: text('created_at').notNull(),
  lastSeenAt: text('last_seen_at').notNull(),
  expiresAt: text('expires_at').notNull(),
  userAgent: text('user_agent').notNull(),
})
