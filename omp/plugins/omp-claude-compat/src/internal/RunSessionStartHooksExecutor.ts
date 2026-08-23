import { matchesMatcher, sessionIds } from '@systemfsoftware/omp-utils'
import { Context, Effect, type Scope } from 'effect'
import type { HookSettings } from '../HookSettings.schema.js'
import type { HookSession } from './HookSession.js'
import { runHookScript } from './RunHookScriptExecutor.js'
import { superviseFork } from './SuperviseForkExecutor.js'

/** @internal */
export class RunSessionStartHooksExecutorDeps extends Context.Service<RunSessionStartHooksExecutorDeps, Scope.Scope>()(
  'RunSessionStartHooksExecutorDeps',
) {}

/** @internal */
export const runSessionStartHooks = Effect.fn('runSessionStartHooks')(function*(
  settings: HookSettings,
  reason: string,
  ctx: HookSession,
) {
  const entries = settings.hooks.SessionStart
  if (entries.length === 0) return

  const cwd = ctx.cwd
  const input: Record<string, unknown> = {
    ...sessionIds(() => ctx.sessionManager.getSessionId()),
    reason,
  }

  for (const entry of entries) {
    if (entry.matcher !== undefined && !matchesMatcher(reason, entry.matcher)) continue

    for (const hook of entry.hooks) {
      if (hook.type !== 'command') continue
      if (hook.if !== undefined) continue
      if (hook.async === true || hook.asyncRewake === true) {
        yield* Effect.forkDetach(
          superviseFork(runHookScript(hook, input, cwd, 'SessionStart', false), ctx, hook.command),
        )
        continue
      }

      yield* runHookScript(hook, input, cwd, 'SessionStart')
    }
  }
})
