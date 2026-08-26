import { Effect } from 'effect'
import type { HookSettings } from '../HookSettings.schema.js'
import type { HookSession } from './HookSession.js'
import { runSessionStartHooks } from './RunSessionStartHooksExecutor.js'

/** @internal */
export const runSessionSwitchHooks = Effect.fn('runSessionSwitchHooks')(function*(
  settings: HookSettings,
  reason: string,
  ctx: HookSession,
) {
  if (reason !== 'resume' && reason !== 'fork') return
  yield* runSessionStartHooks(settings, reason, ctx)
})
