import { beforeEach, describe, expect, it } from 'vitest'
import { useUiStore, type CommentDraft } from './uiStore'

const draft = (exact: string): CommentDraft => ({ exact, prefix: '', suffix: '', from: 0 })

describe('uiStore drafts', () => {
  beforeEach(() => useUiStore.getState().reset())

  it('completing a submitted draft clears it', () => {
    const first = draft('a')
    useUiStore.getState().startDraft(first)
    useUiStore.getState().completeDraft(first)
    expect(useUiStore.getState().draft).toBeNull()
  })

  it('does not clear a newer draft when an older submit finishes late', () => {
    const first = draft('a')
    const second = draft('b')
    useUiStore.getState().startDraft(first)
    useUiStore.getState().startDraft(second)
    useUiStore.getState().completeDraft(first)
    expect(useUiStore.getState().draft).toBe(second)
  })

  it('completing a page comment only closes the page composer', () => {
    useUiStore.getState().startPageDraft()
    useUiStore.getState().completeDraft(null)
    expect(useUiStore.getState().pageDraftOpen).toBe(false)

    const anchored = draft('a')
    useUiStore.getState().startDraft(anchored)
    useUiStore.getState().completeDraft(null)
    expect(useUiStore.getState().draft).toBe(anchored)
  })
})
