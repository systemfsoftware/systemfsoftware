import { Cause, Context, Effect, Either, type Scope } from 'effect'
import { recordAsyncHookContext } from '../async-hook-output.state.js'
import type { HookResult } from '../hook-dispatcher.schema.js'
import { parseHookOutput } from '../hook-output.acl.js'
import type { HookSession } from './hook-session.kernel.js'

export class SuperviseForkExecutorDeps extends Context.Tag('SuperviseForkExecutorDeps')<
  SuperviseForkExecutorDeps,
  Scope.Scope
>() {}

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
        if (Either.isRight(decoded)) {
          const ctxText = decoded.right.hookSpecificOutput?.additionalContext
          if (ctxText !== undefined) recordAsyncHookContext(ctxText)
        }
      },
      onFailure: (cause) => {
        if (Cause.isInterruptedOnly(cause)) return
        ctx.ui.notify(`Background hook failed: ${command}: ${Cause.pretty(cause).split('\n')[0]}`, 'error')
      },
    }),
  )
