import { Context, Effect, type Scope } from 'effect'
import type { HookSettings } from '../hook-settings.acl.js'
import type { HookSession } from './hook-session.kernel.js'
import { runSessionStartHooks } from './run-session-start-hooks.executor.js'

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
