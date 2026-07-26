import type { ExtensionAPI } from '@oh-my-pi/pi-coding-agent'
import { Effect } from 'effect'

function readString(input: Record<string, unknown>, ...keys: readonly string[]): string {
  for (const key of keys) {
    const value = input[key]
    if (typeof value === 'string' && value.length > 0) return value
  }
  return ''
}

function decodeRecord(input: unknown): Record<string, unknown> {
  if (typeof input === 'object' && input !== null && !Array.isArray(input)) {
    return input as Record<string, unknown>
  }
  return {}
}

export const NoSkillDelegationExtension = (pi: ExtensionAPI): void => {
  pi.on('tool_call', async (event, ctx) => {
    const { runSafe } = await import('./helpers.js')
    const { runNoSkillDelegation } = await import('./no-skill-delegation.executor.js')

    return runSafe(
      Effect.gen(function*() {
        const input = decodeRecord(event.input)
        const subagentType = readString(input, 'subagent_type', 'agent')
        const prompt = readString(input, 'prompt', 'task', 'description')
        const result = yield* runNoSkillDelegation(ctx.cwd, event.toolName, subagentType, prompt)
        return result
      }),
    )
  })
}
