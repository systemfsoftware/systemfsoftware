import { sessionIds } from '@systemfsoftware/omp-utils'
import { Array as Arr, Context, Effect, Schema as S, type Scope } from 'effect'

import { analyzeSettings } from '../hook-settings.acl.js'
import type { CommandHook, HookEntry } from '../hook-settings.acl.js'
import type { HookSession } from './hook-session.kernel.js'
import { runHookScript } from './run-hook-script.executor.js'
import { superviseFork } from './supervise-fork.executor.js'

export class RunLifecycleHooksExecutorDeps extends Context.Tag('RunLifecycleHooksExecutorDeps')<
  RunLifecycleHooksExecutorDeps,
  Scope.Scope
>() {}

export const runLifecycleHooks = Effect.fn('runLifecycleHooks')(
  function*(entries: readonly HookEntry[], ctx: HookSession, event: string) {
    const cwd = ctx.cwd
    const input: Record<string, unknown> = { ...sessionIds(() => ctx.sessionManager.getSessionId()) }
    const matcherUnreadable = analyzeSettings({ _tag: 'MatcherUnreadable', event: event }, S.Boolean)
    yield* Effect.forEach(
      Arr.filter(entries, (entry) => !(matcherUnreadable && entry.matcher !== undefined)),
      (entry) =>
        Effect.forEach(
          Arr.filter(entry.hooks, (hook): hook is CommandHook => hook.type === 'command' && hook.if === undefined),
          (hook) =>
            Effect.if(hook.async === true || hook.asyncRewake === true, {
              onTrue: () =>
                Effect.forkDaemon(superviseFork(runHookScript(hook, input, cwd, event, false), ctx, hook.command)),
              onFalse: () => runHookScript(hook, input, cwd, event),
            }),
          { discard: true },
        ),
      { discard: true },
    )
  },
)
