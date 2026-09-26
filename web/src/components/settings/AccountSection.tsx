import { Alert, Button, Group, PasswordInput, Stack, TextInput, Title } from '@mantine/core'
import { useState, type FormEvent } from 'react'
import { MIN_PASSWORD_LENGTH } from '@shared/accounts'
import { errorMessage } from '../../api/http'
import { useChangePassword, useRenameSelf, useWhoami } from '../../api/queries'

function DisplayNameForm({ handle, displayName }: { handle: string; displayName: string }) {
  const rename = useRenameSelf()
  const [value, setValue] = useState(displayName)
  const changed = value.trim() !== '' && value.trim() !== displayName

  function submit(event: FormEvent) {
    event.preventDefault()
    if (changed) rename.mutate(value.trim())
  }

  return (
    <form onSubmit={submit}>
      <Group align="flex-end" gap="sm" wrap="nowrap">
        <TextInput
          flex={1}
          label="Display name"
          description={`Shown on comments and history. Your handle, @${handle}, never changes.`}
          value={value}
          maxLength={60}
          error={rename.error ? errorMessage(rename.error) : undefined}
          onChange={(event) => setValue(event.currentTarget.value)}
        />
        <Button type="submit" loading={rename.isPending} disabled={!changed}>
          Save
        </Button>
      </Group>
    </form>
  )
}

function PasswordForm() {
  const change = useChangePassword()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const mismatch = confirm !== '' && confirm !== next
  const tooShort = next !== '' && next.length < MIN_PASSWORD_LENGTH
  const ready = current !== '' && next.length >= MIN_PASSWORD_LENGTH && next === confirm

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!ready) return
    change.mutate(
      { current, next },
      {
        onSuccess: () => {
          setCurrent('')
          setNext('')
          setConfirm('')
        },
      },
    )
  }

  return (
    <form onSubmit={submit}>
      <Stack gap="sm" maw={420}>
        <PasswordInput
          label="Current password"
          autoComplete="current-password"
          value={current}
          onChange={(event) => setCurrent(event.currentTarget.value)}
        />
        <PasswordInput
          label="New password"
          description={`At least ${MIN_PASSWORD_LENGTH} characters`}
          autoComplete="new-password"
          value={next}
          error={tooShort ? `Use at least ${MIN_PASSWORD_LENGTH} characters` : undefined}
          onChange={(event) => setNext(event.currentTarget.value)}
        />
        <PasswordInput
          label="Repeat new password"
          autoComplete="new-password"
          value={confirm}
          error={mismatch ? 'Passwords do not match' : undefined}
          onChange={(event) => setConfirm(event.currentTarget.value)}
        />
        {change.error && <Alert color="red">{errorMessage(change.error)}</Alert>}
        {change.isSuccess && (
          <Alert color="green">Password changed. Your other devices were signed out.</Alert>
        )}
        <Group>
          <Button type="submit" loading={change.isPending} disabled={!ready}>
            Change password
          </Button>
        </Group>
      </Stack>
    </form>
  )
}

export function AccountSection() {
  const me = useWhoami().data
  if (!me) return null
  return (
    <Stack gap="md">
      <Title order={3}>Account</Title>
      <DisplayNameForm key={me.displayName} handle={me.handle} displayName={me.displayName} />
      <PasswordForm />
    </Stack>
  )
}
