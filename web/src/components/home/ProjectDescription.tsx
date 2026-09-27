import { Text, Textarea } from '@mantine/core'
import { useEffect, useState } from 'react'
import type { Project } from '@shared/pages'
import { errorMessage } from '../../api/http'
import { useSetProjectDescription } from '../../api/queries'

interface ProjectDescriptionProps {
  project: Project
}

export function ProjectDescription({ project }: ProjectDescriptionProps) {
  const setDescription = useSetProjectDescription()
  const [value, setValue] = useState(project.description)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (!dirty) setValue(project.description)
  }, [project.description, dirty])

  async function save() {
    if (value === project.description) {
      setDirty(false)
      return
    }
    try {
      await setDescription.mutateAsync({ id: project.id, description: value })
    } finally {
      setDirty(false)
    }
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <Textarea
        aria-label="Project description"
        variant="unstyled"
        c="dimmed"
        placeholder="Add a description"
        autosize
        minRows={1}
        value={value}
        onChange={(event) => {
          setValue(event.currentTarget.value)
          setDirty(true)
        }}
        onBlur={save}
      />
      {setDescription.error && (
        <Text size="xs" c="red">
          {errorMessage(setDescription.error)}
        </Text>
      )}
    </div>
  )
}
