const TIMESTAMP = /^\d{4}-\d{2}-\d{2}/

export function eventCursorOf(since: string | undefined): string {
  if (!since) return ''
  if (!TIMESTAMP.test(since)) return since
  const millis = Date.parse(since)
  if (Number.isNaN(millis)) return since
  return `${millis.toString(16).padStart(12, '0')}${'0'.repeat(20)}`
}
