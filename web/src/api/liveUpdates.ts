import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import type { StoreEvent } from '@shared/pages'
import { keys } from './queries'

export function keysAffectedBy(event: StoreEvent): (readonly unknown[])[] {
  const { type, projectId, pageId } = event
  if (type.startsWith('project.')) return [keys.projects]
  if (type.startsWith('page.')) {
    return [keys.projectPages(projectId), ...(pageId ? [keys.page(pageId)] : [])]
  }
  if (type.startsWith('comment.') && pageId) return [keys.threads(pageId)]
  return []
}

export function useLiveUpdates(): void {
  const queryClient = useQueryClient()
  useEffect(() => {
    const source = new EventSource('/api/stream')
    let connected = false
    source.onopen = () => {
      if (connected) void queryClient.invalidateQueries()
      connected = true
    }
    source.addEventListener('store', (message) => {
      const event = JSON.parse((message as MessageEvent<string>).data) as StoreEvent
      for (const queryKey of keysAffectedBy(event)) void queryClient.invalidateQueries({ queryKey })
      void queryClient.invalidateQueries({ queryKey: ['search'] })
    })
    return () => source.close()
  }, [queryClient])
}
