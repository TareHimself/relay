import { MantineProvider, createTheme } from '@mantine/core'
import '@mantine/core/styles.css'
import '@mantine/spotlight/styles.css'
import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { keys } from './api/queries'
import { ApiError } from './api/http'
import { App } from './App'
import { AuthGate } from './components/auth/AuthGate'
import './styles/global'

const theme = createTheme({ primaryColor: 'green', defaultRadius: 'md' })
const signedOut = (error: unknown, query: { queryKey: readonly unknown[] }) => {
  const isSignInCheck = query.queryKey[0] === keys.whoami[0]
  if (!isSignInCheck && error instanceof ApiError && error.status === 401) {
    void queryClient.invalidateQueries({ queryKey: keys.whoami })
  }
}
const queryClient: QueryClient = new QueryClient({
  queryCache: new QueryCache({ onError: signedOut }),
  defaultOptions: { queries: { staleTime: 2000, retry: 1 } },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="auto">
      <QueryClientProvider client={queryClient}>
        <AuthGate>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </AuthGate>
      </QueryClientProvider>
    </MantineProvider>
  </StrictMode>,
)
