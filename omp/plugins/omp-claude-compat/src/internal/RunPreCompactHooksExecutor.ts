import { Effect } from 'effect'
import type { HookSettings } from '../HookSettings.schema.js'
import { sessionIds } from '../wire/Session.js'
import type { HookSession } from './HookSession.js'
import { runHooksForEvent } from './RunHooksForEventExecutor.js'

/**
 * The matcher this event documents is `trigger` (manual vs auto), which OMP's
 * payload does not carry — U4's gate skips any hook that declares one, so only
 * unscoped hooks reach here and `matchValue` is never consulted.
 */
/** @internal */
export const runPreCompactHooks = Effect.fn('runPreCompactHooks')(function*(
  settings: HookSettings,
  ctx: HookSession,
) {
  const input: Record<string, unknown> = {
    ...sessionIds(() => ctx.sessionManager.getSessionId()),
  }
  return yield* runHooksForEvent(settings.hooks.PreCompact, '', input, ctx, 'PreCompact')
})
