interface Entry {
  failures: number
  lastFailure: number
  blockedUntil: number
}

const WINDOW_MS = 15 * 60 * 1000
const FREE_ATTEMPTS = 5
const BASE_DELAY_MS = 30_000
const MAX_ENTRIES = 1000

export class LoginThrottle {
  private readonly entries = new Map<string, Entry>()

  constructor(private readonly now: () => number = Date.now) {}

  retryAfterSeconds(key: string): number {
    const entry = this.entries.get(key)
    if (!entry) return 0
    const remaining = entry.blockedUntil - this.now()
    return remaining > 0 ? Math.ceil(remaining / 1000) : 0
  }

  fail(key: string): void {
    const now = this.now()
    this.prune(now)
    const previous = this.entries.get(key)
    const failures = previous && now - previous.lastFailure < WINDOW_MS ? previous.failures + 1 : 1
    const extra = Math.max(0, failures - FREE_ATTEMPTS)
    const delay = failures >= FREE_ATTEMPTS ? Math.min(BASE_DELAY_MS * 2 ** extra, WINDOW_MS) : 0
    this.entries.set(key, { failures, lastFailure: now, blockedUntil: now + delay })
  }

  reset(key: string): void {
    this.entries.delete(key)
  }

  private prune(now: number): void {
    if (this.entries.size < MAX_ENTRIES) return
    for (const [key, entry] of this.entries) {
      if (now - entry.lastFailure >= WINDOW_MS) this.entries.delete(key)
    }
  }
}
