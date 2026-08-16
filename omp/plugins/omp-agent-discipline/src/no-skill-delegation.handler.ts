import type { ExtensionAPI } from '@oh-my-pi/pi-coding-agent'
import { Effect, Result } from 'effect'
import { runNoSkillDelegation } from './no-skill-delegation.executor.js'
import type { RunSafe } from './run-safe.kernel.js'

const isRecord = (input: unknown): input is Record<string, unknown> =>
  typeof input === 'object' && input !== null && !Array.isArray(input)

const decodeRecord = (input: unknown): Record<string, unknown> => (isRecord(input) ? input : {})

function readString(input: Record<string, unknown>, ...keys: readonly string[]): string {
  for (const key of keys) {
    const value = input[key]
    if (typeof value === 'string' && value.length > 0) return value
  }
  return ''
}

export const NoSkillDelegationExtension = (pi: ExtensionAPI, runSafe: RunSafe): void => {
  pi.on('tool_call', async (event, ctx) => {
    const input = decodeRecord(event.input)
    const subagentType = readString(input, 'subagent_type', 'agent')
    const prompt = readString(input, 'prompt', 'task', 'description')
    const result = await runSafe(
      Effect.result(runNoSkillDelegation(ctx.cwd, event.toolName, subagentType, prompt)),
    )
    if (Result.isFailure(result)) throw result.failure
    return result.success
  })
}
