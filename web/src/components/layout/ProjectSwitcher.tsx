import { css } from '@linaria/core'
import { Group, Menu, Skeleton, Text, UnstyledButton } from '@mantine/core'
import { IconCheck, IconPencil, IconPlus, IconSelector } from '@tabler/icons-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import type { Project } from '@shared/pages'
import { errorMessage } from '../../api/http'
import { useCreateProject, useRenameProject } from '../../api/queries'
import { projectPath } from '../../lib/paths'
import { NameDialog } from '../common/NameDialog'

const trigger = css`
  width: 100%;
  padding: 8px;
  border-radius: var(--mantine-radius-md);

  &:hover {
    background: var(--mantine-color-default-border);
  }
`
interface ProjectSwitcherProps {
  projects: Project[]
  current: Project | undefined
  loading: boolean
}

export function ProjectSwitcher({ projects, current, loading }: ProjectSwitcherProps) {
  const navigate = useNavigate()
  const create = useCreateProject()
  const rename = useRenameProject()
  const [creating, setCreating] = useState(false)
  const [renaming, setRenaming] = useState(false)

  function createProject(name: string) {
    create.mutate(
      { name },
      {
        onSuccess: (project) => {
          setCreating(false)
          void navigate(projectPath(project.id))
        },
      },
    )
  }

  function renameProject(name: string) {
    if (!current) return
    rename.mutate({ id: current.id, name }, { onSuccess: () => setRenaming(false) })
  }

  return (
    <>
      <Menu width={248} position="bottom-start" shadow="md">
        <Menu.Target>
          <UnstyledButton className={trigger}>
            <Group gap="xs" wrap="nowrap">
              {loading ? (
                <Skeleton height={14} flex={1} />
              ) : (
                <Text fw={600} size="sm" truncate flex={1}>
                  {current?.name ?? 'Select a project'}
                </Text>
              )}
              <IconSelector size={16} opacity={0.6} />
            </Group>
          </UnstyledButton>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Label>Projects</Menu.Label>
          {projects.map((project) => (
            <Menu.Item
              key={project.id}
              rightSection={project.id === current?.id ? <IconCheck size={14} /> : null}
              onClick={() => void navigate(projectPath(project.id))}
            >
              <Text truncate>{project.name}</Text>
            </Menu.Item>
          ))}
          {projects.length > 0 && <Menu.Divider />}
          {current && (
            <Menu.Item leftSection={<IconPencil size={14} />} onClick={() => setRenaming(true)}>
              Rename project
            </Menu.Item>
          )}
          <Menu.Item leftSection={<IconPlus size={14} />} onClick={() => setCreating(true)}>
            New project
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
      <NameDialog
        opened={creating}
        title="New project"
        label="Project name"
        busy={create.isPending}
        error={create.error ? errorMessage(create.error) : undefined}
        onSubmit={createProject}
        onClose={() => {
          setCreating(false)
          create.reset()
        }}
      />
      <NameDialog
        opened={renaming}
        title="Rename project"
        label="Project name"
        submitLabel="Rename"
        initialValue={current?.name}
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
