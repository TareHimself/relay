import { create } from 'zustand'
import type { LinkDraft } from '../editor/link'

export interface CommentDraft {
  exact: string
  prefix: string
  suffix: string
  from: number
}

export type ThreadFilter = 'open' | 'resolved'

interface UiState {
  activeThreadId: string | null
  hoveredThreadId: string | null
  filter: ThreadFilter
  draft: CommentDraft | null
  pageDraftOpen: boolean
  linkDraft: LinkDraft | null
  openLink: (draft: LinkDraft) => void
  closeLink: () => void
  setActiveThread: (id: string | null) => void
  setHoveredThread: (id: string | null) => void
  setFilter: (filter: ThreadFilter) => void
  startDraft: (draft: CommentDraft) => void
  startPageDraft: () => void
  cancelDraft: () => void
  completeDraft: (submitted: CommentDraft | null) => void
  reset: () => void
}

const initial = {
  activeThreadId: null,
  hoveredThreadId: null,
  draft: null,
  pageDraftOpen: false,
  linkDraft: null,
}

export const useUiStore = create<UiState>((set) => ({
  ...initial,
  filter: 'open',
  openLink: (linkDraft) => set({ linkDraft }),
  closeLink: () => set({ linkDraft: null }),
  setActiveThread: (activeThreadId) => set({ activeThreadId }),
  setHoveredThread: (hoveredThreadId) => set({ hoveredThreadId }),
  setFilter: (filter) => set({ filter, activeThreadId: null }),
  startDraft: (draft) => set({ draft, pageDraftOpen: false, activeThreadId: null }),
  startPageDraft: () => set({ pageDraftOpen: true, draft: null, activeThreadId: null }),
  cancelDraft: () => set({ draft: null, pageDraftOpen: false }),
  completeDraft: (submitted) =>
    set((state) => {
      if (submitted === null) return state.draft === null ? { pageDraftOpen: false } : {}
      return state.draft === submitted ? { draft: null } : {}
    }),
  reset: () => set(initial),
}))
