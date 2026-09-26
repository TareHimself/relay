import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { pageSchema, type Page } from '@shared/pages'
import { ApiError } from '../api/http'
import { keys, useSavePage } from '../api/queries'

export type SaveStatus = 'saved' | 'saving' | 'error' | 'conflict'

export function useDocSync(page: Page) {
  const queryClient = useQueryClient()
  const { mutateAsync: savePage } = useSavePage(page.id)
  const revision = useRef(page.revision)
  const savedBody = useRef(page.body)
  const latestBody = useRef(page.body)
  const conflict = useRef(false)
  const chain = useRef<Promise<void>>(Promise.resolve())
  const flushEditor = useRef<(() => void) | null>(null)

  const [body, setBody] = useState(page.body)
  const [editorKey, setEditorKey] = useState(0)
  const [status, setStatus] = useState<SaveStatus>('saved')

  const isDirty = useCallback(() => latestBody.current !== savedBody.current, [])
  const cachedPage = useCallback(
    () => queryClient.getQueryData<Page>(keys.page(page.id)),
    [queryClient, page.id],
  )

  const adopt = useCallback((next: Page) => {
    revision.current = next.revision
    savedBody.current = next.body
    latestBody.current = next.body
    conflict.current = false
    setBody(next.body)
    setEditorKey((key) => key + 1)
    setStatus('saved')
  }, [])

  const checkRemote = useCallback(() => {
    flushEditor.current?.()
    const latest = cachedPage()
    if (!latest || latest.revision === revision.current || conflict.current) return
    if (latest.body === savedBody.current) {
      revision.current = latest.revision
      return
    }
    if (isDirty()) {
      conflict.current = true
      setStatus('conflict')
    } else {
      adopt(latest)
    }
  }, [adopt, cachedPage, isDirty])

  const drain = useCallback(async () => {
    while (isDirty() && !conflict.current) {
      const sending = latestBody.current
      setStatus('saving')
      try {
        const saved = await savePage({
          body: sending,
          ifRevision: revision.current,
        })
        revision.current = saved.revision
        savedBody.current = sending
        queryClient.setQueryData(keys.page(page.id), saved)
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) {
          const current = pageSchema.safeParse(
            (error.details as { current?: unknown } | undefined)?.current,
          )
          if (current.success) queryClient.setQueryData(keys.page(page.id), current.data)
          conflict.current = true
          setStatus('conflict')
        } else {
          setStatus('error')
        }
        return
      }
    }
    if (!conflict.current) {
      setStatus('saved')
      checkRemote()
    }
  }, [checkRemote, isDirty, page.id, queryClient, savePage])

  const enqueue = useCallback(() => {
    chain.current = chain.current.then(drain)
    return chain.current
  }, [drain])

  const onChange = useCallback(
    (value: string) => {
      latestBody.current = value
      void enqueue()
    },
    [enqueue],
  )

  const ensureSaved = useCallback(() => {
    flushEditor.current?.()
    return enqueue()
  }, [enqueue])

  useEffect(checkRemote, [checkRemote, page.revision])

  useEffect(() => () => void ensureSaved(), [ensureSaved])

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (isDirty() || status === 'saving') event.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [status, isDirty])

  return {
    body,
    editorKey,
    status,
    onChange,
    ensureSaved,
    onFlushReady: (flush: (() => void) | null) => {
      flushEditor.current = flush
    },
    retry: () => void enqueue(),
    loadLatest: () => {
      const latest = cachedPage()
      if (latest) adopt(latest)
    },
    keepMine: () => {
      const latest = cachedPage()
      if (!latest) return
      conflict.current = false
      revision.current = latest.revision
      void enqueue()
    },
  }
}
