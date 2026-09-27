import { css } from '@linaria/core'
import { Box, Group, Paper, Stack, Text } from '@mantine/core'
import { IconPlus } from '@tabler/icons-react'
import { Link } from 'react-router'
import type { Project } from '@shared/pages'
import { projectPath } from '../../lib/paths'

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
const badge = css`
  display: grid;
  flex: none;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: var(--mantine-color-green-filled);
  color: white;
  font-size: 15px;
  font-weight: 700;
`

interface ProjectCardProps {
  project: Project
}

export function ProjectCard({ project }: ProjectCardProps) {
  return (
    <Paper
      component={Link}
      to={projectPath(project.id)}
      withBorder
      radius="md"
      p="md"
      className={card}
    >
      <Stack gap={8} h="100%">
        <Group gap={8} wrap="nowrap">
          <Box className={badge}>{project.name.slice(0, 1).toUpperCase()}</Box>
          <Text fw={600} lineClamp={1}>
            {project.name}
          </Text>
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
