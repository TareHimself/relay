import { Center, Loader } from '@mantine/core'
import type { ReactNode } from 'react'
import { ApiError, errorMessage } from '../../api/http'
import { useWhoami } from '../../api/queries'
import { ErrorNotice } from '../common/ErrorNotice'
import { LoginPage } from './LoginPage'

export function AuthGate({ children }: { children: ReactNode }) {
  const me = useWhoami()
  if (me.isPending) {
    return (
      <Center mih="100vh">
        <Loader size="sm" />
      </Center>
    )
  }
  if (me.error instanceof ApiError && me.error.status === 401) return <LoginPage />
  if (me.error) return <ErrorNotice message={errorMessage(me.error)} />
  return <>{children}</>
}
