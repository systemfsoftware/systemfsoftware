import type { ExtensionAPI } from '@oh-my-pi/pi-coding-agent'
import { TomlLoader } from '@systemfsoftware/omp-utils'
import { Effect, Either } from 'effect'
import { NoSkillDelegationExecutorDeps, runNoSkillDelegation } from './no-skill-delegation.executor.js'

const provideNoSkillDelegationDeps = Effect.provideServiceEffect(
  NoSkillDelegationExecutorDeps,
  Effect.gen(function*() {
    const loader = yield* TomlLoader
    return loader
  }),
)

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

export const NoSkillDelegationExtension = (pi: ExtensionAPI): void => {
  pi.on('tool_call', async (event, ctx) => {
    // handler-no-shell-imports bans .policy imports in handlers; the lazy
    // chain also keeps the platform-node runtime out of plugin registration.
    const { runSafe } = await import('./run-safe.policy.js')
    const input = decodeRecord(event.input)
    const subagentType = readString(input, 'subagent_type', 'agent')
    const prompt = readString(input, 'prompt', 'task', 'description')
    const either = await runSafe(
      Effect.either(runNoSkillDelegation(ctx.cwd, event.toolName, subagentType, prompt)).pipe(
        provideNoSkillDelegationDeps,
      ),
    )
    if (Either.isLeft(either)) throw either.left
    return either.right
  })
}
