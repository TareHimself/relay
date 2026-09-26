import { StreamableHTTPTransport } from '@hono/mcp'
import type { Handler } from 'hono'
import type { AppEnv } from '../http/auth'
import { createMcpServer } from './server'

export function mcpHandler(): Handler<AppEnv> {
  return async (c) => {
    const server = createMcpServer(c.get('workspace'))
    const transport = new StreamableHTTPTransport({ enableJsonResponse: true })
    await server.connect(transport)
    return (await transport.handleRequest(c)) ?? c.body(null, 204)
  }
}
