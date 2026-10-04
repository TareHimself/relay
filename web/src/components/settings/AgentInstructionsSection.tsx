import { Loader } from '@mantine/core'
import { useAgentInstructions, useSaveAgentInstructions } from '../../api/queries'
import { InstructionsEditor } from './InstructionsEditor'

export function AgentInstructionsSection() {
  const instructions = useAgentInstructions()
  const save = useSaveAgentInstructions()
  if (!instructions.data) return <Loader size="sm" />
  const { text, isDefault } = instructions.data

  return (
    <InstructionsEditor
      key={text}
      title="Agent instructions"
      description="Sent to every agent when it connects over MCP. Project rules are added after this text and take priority."
      saved={text}
      saving={save.isPending}
      error={save.error}
      onSave={(next) => save.mutate(next)}
      onReset={isDefault ? undefined : () => save.mutate(null)}
    />
  )
}
