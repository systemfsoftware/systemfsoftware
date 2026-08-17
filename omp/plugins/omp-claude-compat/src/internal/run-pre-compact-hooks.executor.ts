import { sessionIds } from '@systemfsoftware/omp-utils'
import { Context, Effect, type Scope } from 'effect'
import type { HookSettings } from '../hook-settings.schema.js'
import type { HookSession } from './hook-session.kernel.js'
import { runHooksForEvent } from './run-hooks-for-event.executor.js'

export class RunPreCompactHooksExecutorDeps extends Context.Service<RunPreCompactHooksExecutorDeps, Scope.Scope>()(
  'RunPreCompactHooksExecutorDeps',
) {}

/**
 * The matcher this event documents is `trigger` (manual vs auto), which OMP's
 * payload does not carry — U4's gate skips any hook that declares one, so only
 * unscoped hooks reach here and `matchValue` is never consulted.
 */
export const runPreCompactHooks = Effect.fn('runPreCompactHooks')(function*(
  settings: HookSettings,
  ctx: HookSession,
) {
  const input: Record<string, unknown> = {
    ...sessionIds(() => ctx.sessionManager.getSessionId()),
  }
  return yield* runHooksForEvent(settings.hooks.PreCompact, '', input, ctx, 'PreCompact')
})
