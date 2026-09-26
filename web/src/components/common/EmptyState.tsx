import { Stack, Text, Title } from '@mantine/core'
import type { ReactNode } from 'react'

interface EmptyStateProps {
  title: string
  description: string
  action?: ReactNode
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <Stack gap="xs" mt="xl" maw={720} mx="auto" align="flex-start">
      <Title order={1}>{title}</Title>
      <Text c="dimmed">{description}</Text>
      {action}
    </Stack>
  )
}
