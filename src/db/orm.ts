import type { drizzle } from 'drizzle-orm/better-sqlite3'
import type * as schema from './schema'

export type Orm = ReturnType<typeof drizzle<typeof schema>>
