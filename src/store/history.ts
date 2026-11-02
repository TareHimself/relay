import type Database from 'better-sqlite3'

export interface ThinOptions {
  keepAllDays: number
  keepDailyDays: number
  dryRun?: boolean | undefined
  now?: number | undefined
}

export const DEFAULT_THIN: Pick<ThinOptions, 'keepAllDays' | 'keepDailyDays'> = {
  keepAllDays: 7,
  keepDailyDays: 90,
}

const DAY = 86_400_000

const CANDIDATES = `
  SELECT v.id FROM page_versions v
  WHERE v.kind = 'edit'
    AND v.created_at < :keepAll
    AND v.id <> (SELECT max(id) FROM page_versions WHERE page_id = v.page_id)
    AND v.id <> (
      SELECT max(w.id) FROM page_versions w
      WHERE w.page_id = v.page_id AND w.actor = v.actor AND w.kind = 'edit'
        AND w.created_at < :keepAll
        AND CASE
          WHEN v.created_at >= :keepDaily THEN w.created_at >= :keepDaily
            AND date(w.created_at) = date(v.created_at)
          ELSE w.created_at < :keepDaily
            AND strftime('%Y-%W', w.created_at) = strftime('%Y-%W', v.created_at)
        END
    )`

export function thinHistory(
  db: Database.Database,
  options: ThinOptions,
): { candidates: number; deleted: number } {
  const now = options.now ?? Date.now()
  const params = {
    keepAll: new Date(now - options.keepAllDays * DAY).toISOString(),
    keepDaily: new Date(now - options.keepDailyDays * DAY).toISOString(),
  }
  const candidates = (db.prepare(CANDIDATES).all(params) as { id: string }[]).length
  if (options.dryRun || candidates === 0) return { candidates, deleted: 0 }
  const { changes } = db
    .prepare(`DELETE FROM page_versions WHERE id IN (${CANDIDATES})`)
    .run(params)
  return { candidates, deleted: changes }
}
