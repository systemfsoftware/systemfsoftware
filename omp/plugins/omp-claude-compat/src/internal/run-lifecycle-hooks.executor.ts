import { sessionIds } from '@systemfsoftware/omp-utils'
import { Context, Effect, Schema as S, type Scope } from 'effect'
import { analyzeSettings } from '../hook-settings.acl.js'
import type { HookEntry } from '../hook-settings.acl.js'
import type { HookSession } from './hook-session.kernel.js'
import { runHookScript } from './run-hook-script.executor.js'
import { superviseFork } from './supervise-fork.executor.js'

export class RunLifecycleHooksExecutorDeps extends Context.Tag('RunLifecycleHooksExecutorDeps')<
  RunLifecycleHooksExecutorDeps,
  Scope.Scope
>() {}

export const runLifecycleHooks = Effect.fn('runLifecycleHooks')(function*(
  entries: readonly HookEntry[],
  ctx: HookSession,
  event: string,
) {
  if (entries.length === 0) return

  const cwd = ctx.cwd

  const input: Record<string, unknown> = {
    ...sessionIds(() => ctx.sessionManager.getSessionId()),
  }

  // The matcher axis is the same refusal `runHooksForEvent` makes: an event
  // whose matcher this bridge cannot read must not run a matcher'd hook as
  // though the matcher had matched.
  const matcherUnreadable = analyzeSettings({ _tag: 'MatcherUnreadable', event }, S.Boolean)

  for (const entry of entries) {
    if (matcherUnreadable && entry.matcher !== undefined) continue
    for (const hook of entry.hooks) {
      if (hook.type !== 'command') continue
      if (hook.if !== undefined) continue
      if (hook.async === true || hook.asyncRewake === true) {
        yield* Effect.forkDaemon(
          superviseFork(runHookScript(hook, input, cwd, event, false), ctx, hook.command),
        )
      } else {
        yield* runHookScript(hook, input, cwd, event)
      }
    }
  }
})
