import { useCallback } from 'react'
import { usePeople, useWhoami } from './queries'

export function useCurrentActor(): string | undefined {
  return useWhoami().data?.handle
}

export function useDisplayName(): (handle: string) => string {
  const people = usePeople().data
  return useCallback(
    (handle: string) => people?.find((person) => person.handle === handle)?.displayName ?? handle,
    [people],
  )
}
