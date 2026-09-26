import { StoreError } from '../core/errors'
import type { RelayStore } from '../store/relay-store'
import type { AuthContext } from './context'

export class Access {
  constructor(
    private readonly store: RelayStore,
    readonly auth: AuthContext,
  ) {}

  get actor(): string {
    return this.auth.actor
  }

  write(): void {
    if (this.auth.scope !== 'write') throw new StoreError('forbidden', 'This token is read-only')
  }

  admin(): void {
    if (this.auth.kind !== 'admin') throw new StoreError('forbidden', 'Admin access required')
  }

  unrestricted(): void {
    if (this.auth.projectId) {
      throw new StoreError('forbidden', 'This token is restricted to a single project')
    }
  }

  project(projectId: string): void {
    if (this.auth.projectId && this.auth.projectId !== projectId) {
      throw new StoreError('forbidden', 'This token cannot access that project')
    }
  }

  page(pageId: string): void {
    this.project(this.store.projectIdOfPage(pageId))
  }

  thread(threadId: string): void {
    this.project(this.store.threads.projectIdOf(threadId))
  }

  projectFilter(requested?: string): string | undefined {
    if (!this.auth.projectId) return requested
    if (requested && requested !== this.auth.projectId) {
      throw new StoreError('forbidden', 'This token cannot access that project')
    }
    return this.auth.projectId
  }
}
