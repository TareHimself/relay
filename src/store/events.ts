import type { StoreEvent } from '../shared/pages'
import { newId } from '../core/ids'

export function newEvent(
  type: string,
  actor: string,
  projectId: string,
  extra: Pick<StoreEvent, 'pageId' | 'threadId' | 'revision' | 'summary'> = {},
): StoreEvent {
  return { id: newId(), type, at: new Date().toISOString(), actor, projectId, ...extra }
}

export function excerpt(text: string): string {
  return text.length > 200 ? `${text.slice(0, 199)}…` : text
}
