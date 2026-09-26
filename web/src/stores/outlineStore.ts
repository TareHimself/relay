import { create } from 'zustand'
import type { OutlineItem } from '../editor/outline'

interface OutlineState {
  items: OutlineItem[]
  active: number
  jump: ((from: number) => void) | null
  gutter: boolean
  setGutter: (gutter: boolean) => void
  publish: (items: OutlineItem[], jump: (from: number) => void) => void
  setActive: (active: number) => void
  clear: () => void
}

export const useOutlineStore = create<OutlineState>((set) => ({
  items: [],
  active: -1,
  jump: null,
  gutter: false,
  setGutter: (gutter) => set((state) => (state.gutter === gutter ? state : { gutter })),
  publish: (items, jump) => set({ items, jump }),
  setActive: (active) => set((state) => (state.active === active ? state : { active })),
  clear: () => set({ items: [], active: -1, jump: null, gutter: false }),
}))
