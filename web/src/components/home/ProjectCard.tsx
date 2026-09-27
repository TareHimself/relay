import { css } from '@linaria/core'
import { ActionIcon, Group, Menu, Paper, Stack, Text } from '@mantine/core'
import { IconDots, IconPencil, IconPlus } from '@tabler/icons-react'
import { useState } from 'react'
import { Link } from 'react-router'
import type { Project } from '@shared/pages'
import { errorMessage } from '../../api/http'
import { useRenameProject } from '../../api/queries'
import { projectPath } from '../../lib/paths'
import { NameDialog } from '../common/NameDialog'

const card = css`
  display: block;
  height: 100%;
  min-height: 120px;
  color: inherit;
  text-decoration: none;
  transition:
    border-color 120ms ease,
    box-shadow 120ms ease;

  &:hover {
    border-color: var(--mantine-color-gray-5);
    box-shadow: var(--mantine-shadow-sm);
  }
`
const newCard = css`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  min-height: 120px;
  border: 1px dashed var(--mantine-color-default-border);
  border-radius: var(--mantine-radius-md);
  background: none;
  color: var(--mantine-color-dimmed);
  cursor: pointer;

  &:hover {
    border-color: var(--mantine-color-gray-5);
    color: var(--mantine-color-text);
  }
`

interface ProjectCardProps {
  project: Project
}

export function ProjectCard({ project }: ProjectCardProps) {
  const rename = useRenameProject()
  const [renaming, setRenaming] = useState(false)

  function renameProject(name: string) {
    rename.mutate({ id: project.id, name }, { onSuccess: () => setRenaming(false) })
  }

  return (
    <>
      <Paper
        component={Link}
        to={projectPath(project.id)}
        withBorder
        radius="md"
        p="md"
        className={card}
      >
        <Stack gap={8} h="100%">
          <Group justify="space-between" wrap="nowrap" gap={4}>
            <Text fw={600} lineClamp={1}>
              {project.name}
            </Text>
            <Menu position="bottom-end" width={180} shadow="md">
              <Menu.Target>
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  size="sm"
                  aria-label="Project actions"
                  onClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                  }}
                >
                  <IconDots size={16} />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item
                  leftSection={<IconPencil size={14} />}
                  onClick={(event) => {
                    event.preventDefault()
                    setRenaming(true)
                  }}
                >
                  Rename project
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
          <Text
            size="sm"
            c="dimmed"
            lineClamp={3}
            fs={project.description ? undefined : 'italic'}
            flex={1}
          >
            {project.description || 'No description'}
          </Text>
        </Stack>
      </Paper>
      <NameDialog
        opened={renaming}
        title="Rename project"
        label="Project name"
        submitLabel="Rename"
        initialValue={project.name}
        busy={rename.isPending}
        error={rename.error ? errorMessage(rename.error) : undefined}
        onSubmit={renameProject}
        onClose={() => {
          setRenaming(false)
          rename.reset()
        }}
      />
    </>
  )
}

export function NewProjectCard({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className={newCard} onClick={onClick}>
      <Group gap={6}>
        <IconPlus size={18} />
        <Text size="sm">New project</Text>
      </Group>
    </button>
  )
}
