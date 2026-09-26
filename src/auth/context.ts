import type { TokenScope } from '../shared/tokens'

export interface AuthContext {
  kind: 'admin' | 'token'
  actor: string
  scope: TokenScope
  projectId: string | null
  sessionId?: string | undefined
}
