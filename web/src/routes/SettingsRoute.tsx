import { Paper, Stack, Title } from '@mantine/core'
import type { ReactNode } from 'react'
import { AccountSection } from '../components/settings/AccountSection'
import { AgentInstructionsSection } from '../components/settings/AgentInstructionsSection'
import { BackupSection } from '../components/settings/BackupSection'
import { SessionsSection } from '../components/settings/SessionsSection'
import { TokensSection } from '../components/settings/TokensSection'
import { useDocumentTitle } from '../lib/useDocumentTitle'

function Card({ children }: { children: ReactNode }) {
  return (
    <Paper withBorder radius="md" p="lg">
      {children}
    </Paper>
  )
}

export function SettingsRoute() {
  useDocumentTitle('Settings')
  return (
    <Stack gap="lg" maw={1000} mx="auto" pt="md">
      <Title order={1}>Settings</Title>
      <Card>
        <AccountSection />
      </Card>
      <Card>
        <AgentInstructionsSection />
      </Card>
      <Card>
        <TokensSection />
      </Card>
      <Card>
        <SessionsSection />
      </Card>
      <Card>
        <BackupSection />
      </Card>
    </Stack>
  )
}
