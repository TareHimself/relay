import { eq } from 'drizzle-orm'
import type { Orm } from '../db/orm'
import * as schema from '../db/schema'
import { DEFAULT_AGENT_INSTRUCTIONS, type AgentInstructions } from '../shared/agentInstructions'

const AGENT_INSTRUCTIONS_KEY = 'agent_instructions'
const PROJECT_INSTRUCTIONS_PREFIX = 'project_instructions:'

export class SettingsService {
  constructor(private readonly orm: Orm) {}

  agentInstructions(): AgentInstructions {
    const row = this.orm
      .select()
      .from(schema.settings)
      .where(eq(schema.settings.key, AGENT_INSTRUCTIONS_KEY))
      .get()
    return {
      text: row?.value ?? DEFAULT_AGENT_INSTRUCTIONS,
      isDefault: !row,
      defaultText: DEFAULT_AGENT_INSTRUCTIONS,
    }
  }

  setAgentInstructions(text: string): AgentInstructions {
    this.orm
      .insert(schema.settings)
      .values({ key: AGENT_INSTRUCTIONS_KEY, value: text })
      .onConflictDoUpdate({ target: schema.settings.key, set: { value: text } })
      .run()
    return this.agentInstructions()
  }

  projectInstructions(projectId: string): string {
    return (
      this.orm
        .select()
        .from(schema.settings)
        .where(eq(schema.settings.key, `${PROJECT_INSTRUCTIONS_PREFIX}${projectId}`))
        .get()?.value ?? ''
    )
  }

  setProjectInstructions(projectId: string, text: string): string {
    const key = `${PROJECT_INSTRUCTIONS_PREFIX}${projectId}`
    if (!text.trim()) {
      this.orm.delete(schema.settings).where(eq(schema.settings.key, key)).run()
      return ''
    }
    this.orm
      .insert(schema.settings)
      .values({ key, value: text })
      .onConflictDoUpdate({ target: schema.settings.key, set: { value: text } })
      .run()
    return text
  }

  resetAgentInstructions(): AgentInstructions {
    this.orm.delete(schema.settings).where(eq(schema.settings.key, AGENT_INSTRUCTIONS_KEY)).run()
    return this.agentInstructions()
  }
}
