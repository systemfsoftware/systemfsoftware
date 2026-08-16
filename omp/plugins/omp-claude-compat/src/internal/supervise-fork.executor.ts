import { Cause, Context, Effect, Exit, type Scope } from 'effect'
import { recordAsyncHookContext } from '../async-hook-output.state.js'
import type { HookResult } from '../hook-dispatcher.schema.js'
import { parseHookOutput } from '../hook-output.acl.js'
import type { HookSession } from './hook-session.kernel.js'

export class SuperviseForkExecutorDeps extends Context.Service<SuperviseForkExecutorDeps, Scope.Scope>()(
  'SuperviseForkExecutorDeps',
) {}

/**
 * Nothing awaits a forked hook, so an unhandled failure here reaches no one:
 * a mistyped exec-form command would fail to spawn in total silence.
 */
export const superviseFork = <E, R>(
  hook: Effect.Effect<HookResult, E, R>,
  ctx: HookSession,
  command: string,
): Effect.Effect<void, never, R> =>
  hook.pipe(
    Effect.matchCause({
      onSuccess: (result) => {
        const decoded = parseHookOutput(result.stdout)
        if (Exit.isSuccess(decoded)) {
          const ctxText = decoded.value.hookSpecificOutput?.additionalContext
          if (ctxText !== undefined) recordAsyncHookContext(ctxText)
        }
      },
      onFailure: (cause) => {
        if (Cause.hasInterruptsOnly(cause)) return
        ctx.ui.notify(`Background hook failed: ${command}: ${Cause.pretty(cause).split('\n')[0]}`, 'error')
      },
    }),
  )
