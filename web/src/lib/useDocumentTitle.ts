import { useEffect } from 'react'

const APP_NAME = 'Relay'

export function useDocumentTitle(...parts: Array<string | undefined>): void {
  const title = parts.filter(Boolean).join(' · ')
  useEffect(() => {
    if (!title) return
    document.title = `${title} · ${APP_NAME}`
    return () => {
      document.title = APP_NAME
    }
  }, [title])
}
