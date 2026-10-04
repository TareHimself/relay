import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export type PageWidth = 'standard' | 'full'
export type HomeSort = 'title' | 'recent'

interface PrefsState {
  pageWidth: PageWidth
  togglePageWidth: () => void
  homeSort: HomeSort
  setHomeSort: (sort: HomeSort) => void
  sidebarCollapsed: boolean
  toggleSidebar: () => void
  lastProjectId: string | null
  setLastProject: (projectId: string) => void
}

export const usePrefsStore = create<PrefsState>()(
  persist(
    (set) => ({
      pageWidth: 'standard',
      togglePageWidth: () =>
        set((state) => ({ pageWidth: state.pageWidth === 'standard' ? 'full' : 'standard' })),
      homeSort: 'title',
      setHomeSort: (homeSort) => set({ homeSort }),
      sidebarCollapsed: false,
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      lastProjectId: null,
      setLastProject: (lastProjectId) => set({ lastProjectId }),
    }),
    { name: 'relay-prefs', storage: createJSONStorage(() => localStorage) },
  ),
)
