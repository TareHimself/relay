import { styled } from '@linaria/react'
import { useOutlineStore } from '../../stores/outlineStore'
import { OutlineTree } from './OutlineTree'

export const GUTTER_WIDTH = 220
export const GUTTER_GAP = 20

const Track = styled.div`
  position: absolute;
  top: 52px;
  bottom: 0;
  right: 100%;
  width: ${GUTTER_WIDTH}px;
  margin-right: ${GUTTER_GAP}px;
  animation: relay-fade-in 160ms ease;
`
const Sticky = styled.div`
  position: sticky;
  top: 24px;
  max-height: calc(100vh - 48px);
  padding-top: 8px;
  overflow-y: auto;
  scrollbar-width: thin;
`

export function OutlineGutter() {
  const hasItems = useOutlineStore((state) => state.items.length > 0)
  if (!hasItems) return null
  return (
    <Track>
      <Sticky>
        <OutlineTree />
      </Sticky>
    </Track>
  )
}
