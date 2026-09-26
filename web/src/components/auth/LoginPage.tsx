import { Alert, Button, Center, Paper, PasswordInput, Stack, Text, Title } from '@mantine/core'
import { useState, type FormEvent } from 'react'
import { errorMessage } from '../../api/http'
import { useLogin } from '../../api/queries'
import { useDocumentTitle } from '../../lib/useDocumentTitle'

export function LoginPage() {
  useDocumentTitle('Sign in')
  const login = useLogin()
  const [password, setPassword] = useState('')

  function submit(event: FormEvent) {
    event.preventDefault()
    if (password) login.mutate(password)
  }

  return (
    <Center mih="100vh" p="md">
      <Paper withBorder radius="md" p="xl" w="100%" maw={380}>
        <form onSubmit={submit}>
          <Stack gap="md">
            <Stack gap={2}>
              <Title order={2} style={{ letterSpacing: '-0.04em' }}>
                relay
              </Title>
              <Text size="sm" c="dimmed">
                Sign in to continue
              </Text>
            </Stack>
            {login.error && (
              <Alert color="red" role="alert">
                {errorMessage(login.error)}
              </Alert>
            )}
            <input
              type="text"
              name="username"
              autoComplete="username"
              defaultValue="admin"
              readOnly
              tabIndex={-1}
              aria-hidden
              style={{ position: 'absolute', left: -9999, width: 1, height: 1, opacity: 0 }}
            />
            <PasswordInput
              autoFocus
              label="Password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.currentTarget.value)}
            />
            <Button type="submit" loading={login.isPending} disabled={!password}>
              Sign in
            </Button>
          </Stack>
        </form>
      </Paper>
    </Center>
  )
}
