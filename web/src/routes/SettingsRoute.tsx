import { Divider, Stack, Title } from '@mantine/core'
import { AccountSection } from '../components/settings/AccountSection'
import { SessionsSection } from '../components/settings/SessionsSection'
import { TokensSection } from '../components/settings/TokensSection'
import { useDocumentTitle } from '../lib/useDocumentTitle'

export function SettingsRoute() {
  useDocumentTitle('Settings')
  return (
    <Stack gap="xl" maw={1000} mx="auto" pt="md">
      <Title order={1}>Settings</Title>
      <AccountSection />
      <SessionsSection />
      <Divider />
      <TokensSection />
    </Stack>
  )
}
