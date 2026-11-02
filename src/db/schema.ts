import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

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
  slug: text('slug').notNull(),
  createdAt: text('created_at').notNull(),
})

export const pages = sqliteTable(
  'pages',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull(),
    title: text('title').notNull(),
    slug: text('slug').notNull(),
    body: text('body').notNull(),
    tags: text('tags', { mode: 'json' }).$type<string[]>().notNull(),
    revision: text('revision').notNull(),
    excerpt: text('excerpt').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    updatedBy: text('updated_by').notNull(),
    deletedAt: text('deleted_at'),
  },
  (table) => [index('pages_project').on(table.projectId, table.slug)],
)

export const versionKinds = ['create', 'edit', 'rename', 'tags', 'restore', 'delete'] as const
export type VersionKind = (typeof versionKinds)[number]

export const pageVersions = sqliteTable(
  'page_versions',
  {
    id: text('id').primaryKey(),
    pageId: text('page_id').notNull(),
    projectId: text('project_id').notNull(),
    kind: text('kind', { enum: versionKinds }).notNull(),
    title: text('title').notNull(),
    tags: text('tags', { mode: 'json' }).$type<string[]>().notNull(),
    body: text('body').notNull(),
    revision: text('revision').notNull(),
    actor: text('actor').notNull(),
    summary: text('summary'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('page_versions_page').on(table.pageId, table.id)],
)

export const threads = sqliteTable(
  'threads',
  {
    id: text('id').primaryKey(),
    pageId: text('page_id').notNull(),
    projectId: text('project_id').notNull(),
    status: text('status', { enum: ['open', 'answered', 'resolved'] }).notNull(),
    anchorExact: text('anchor_exact'),
    anchorPrefix: text('anchor_prefix'),
    anchorSuffix: text('anchor_suffix'),
    anchorOffset: integer('anchor_offset'),
    recipients: text('recipients', { mode: 'json' }).$type<string[]>().notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('threads_page').on(table.pageId)],
)

export const messages = sqliteTable(
  'messages',
  {
    id: text('id').primaryKey(),
    threadId: text('thread_id').notNull(),
    author: text('author').notNull(),
    body: text('body').notNull(),
    at: text('at').notNull(),
    editedAt: text('edited_at'),
  },
  (table) => [index('messages_thread').on(table.threadId, table.at)],
)

export const searchDocs = sqliteTable(
  'search_docs',
  {
    docId: integer('doc_id').primaryKey({ autoIncrement: true }),
    kind: text('kind', { enum: ['page', 'thread', 'project'] }).notNull(),
    id: text('id').notNull(),
    pageId: text('page_id'),
    projectId: text('project_id').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
  },
  (table) => [
    uniqueIndex('search_docs_key').on(table.kind, table.id),
    index('search_docs_page').on(table.pageId),
  ],
)

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

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
})
