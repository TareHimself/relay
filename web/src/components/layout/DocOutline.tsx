import { Box, Group, ScrollArea } from '@mantine/core'
import { useOutlineStore } from '../../stores/outlineStore'
import { Eyebrow } from '../common/Eyebrow'
import { OutlineTree } from '../doc/OutlineTree'

export function DocOutline() {
  const hasItems = useOutlineStore((state) => state.items.length > 0)
  if (!hasItems) return null

  return (
    <Box mt="sm">
      <Group px="xs" mb={4}>
        <Eyebrow>Outline</Eyebrow>
      </Group>
      <ScrollArea.Autosize mah={280} type="auto">
        <OutlineTree />
      </ScrollArea.Autosize>
    </Box>
  )
}
