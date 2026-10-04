import { Button, Collapse, Loader, Stack } from '@mantine/core'
import { IconChevronDown, IconChevronRight, IconGavel } from '@tabler/icons-react'
import { useState } from 'react'
import { useProjectInstructions, useSaveProjectInstructions } from '../../api/queries'
import { InstructionsEditor } from './InstructionsEditor'

export function ProjectInstructionsSection({ projectId }: { projectId: string }) {
  const instructions = useProjectInstructions(projectId)
  const save = useSaveProjectInstructions(projectId)
  const [open, setOpen] = useState(false)
  if (!instructions.data) return <Loader size="sm" />
  const { text } = instructions.data

  return (
    <Stack gap="xs" maw={640}>
      <Button
        variant="subtle"
        color="gray"
        size="compact-sm"
        justify="flex-start"
        w="fit-content"
        leftSection={<IconGavel size={16} />}
        rightSection={open ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
        onClick={() => setOpen((value) => !value)}
      >
        {text ? 'Agent rules' : 'Add agent rules'}
      </Button>
      <Collapse expanded={open}>
        <InstructionsEditor
          key={text}
          title="Agent rules"
          description="Rules for agents working in this project, added after your global agent instructions. Only people can edit these, agents can't."
          saved={text}
          placeholder="Naming, tone, which pages are canonical, anything agents keep getting wrong"
          saving={save.isPending}
          error={save.error}
          onSave={(next) => save.mutate(next)}
        />
      </Collapse>
    </Stack>
  )
}
