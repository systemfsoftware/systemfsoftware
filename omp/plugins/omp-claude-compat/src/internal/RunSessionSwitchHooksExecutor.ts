import { Context, Effect, type Scope } from 'effect'
import type { HookSettings } from '../HookSettings.schema.js'
import type { HookSession } from './HookSession.js'
import { runSessionStartHooks } from './RunSessionStartHooksExecutor.js'

export class RunSessionSwitchHooksExecutorDeps
  extends Context.Service<RunSessionSwitchHooksExecutorDeps, Scope.Scope>()(
    'RunSessionSwitchHooksExecutorDeps',
  )
{}

export const runSessionSwitchHooks = Effect.fn('runSessionSwitchHooks')(function*(
  settings: HookSettings,
  reason: string,
  ctx: HookSession,
) {
  if (reason !== 'resume' && reason !== 'fork') return
  yield* runSessionStartHooks(settings, reason, ctx)
})
