import { createSpotlight } from '@mantine/spotlight'

export const [searchStore, searchSpotlight] = createSpotlight()

export function selectFirstResult(): void {
  const { listId } = searchStore.getState()
  const list = listId ? document.getElementById(listId) : null
  const first = list?.querySelector('[data-action]')
  if (!list || !first) return
  list.querySelector('[data-selected]')?.removeAttribute('data-selected')
  first.setAttribute('data-selected', 'true')
  searchStore.updateState((state) => ({ ...state, selected: 0 }))
}
