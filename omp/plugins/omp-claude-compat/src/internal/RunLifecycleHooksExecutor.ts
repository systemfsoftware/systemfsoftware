import { sessionIds } from '@systemfsoftware/omp-utils'
import { Array as Arr, Context, Effect, Schema as S, type Scope } from 'effect'

import { analyzeSettings } from '../HookSettings.js'
import type { CommandHook, HookEntry } from '../HookSettings.schema.js'
import type { HookSession } from './HookSession.js'
import { runHookScript } from './RunHookScriptExecutor.js'
import { settingsAnalysisTags } from './SettingsAnalysisTags.js'
import { superviseFork } from './SuperviseForkExecutor.js'

export class RunLifecycleHooksExecutorDeps extends Context.Service<RunLifecycleHooksExecutorDeps, Scope.Scope>()(
  'RunLifecycleHooksExecutorDeps',
) {}

export const runLifecycleHooks = Effect.fn('runLifecycleHooks')(
  function*(entries: readonly HookEntry[], ctx: HookSession, event: string) {
    const cwd = ctx.cwd
    const input: Record<string, unknown> = { ...sessionIds(() => ctx.sessionManager.getSessionId()) }
    const matcherUnreadable = analyzeSettings({ ...settingsAnalysisTags.MatcherUnreadable, event: event }, S.Boolean)
    yield* Effect.forEach(
      Arr.filter(entries, (entry) => !(matcherUnreadable && entry.matcher !== undefined)),
      (entry) =>
        Effect.forEach(
          Arr.filter(entry.hooks, (hook): hook is CommandHook => hook.type === 'command' && hook.if === undefined),
          (hook) =>
            hook.async === true || hook.asyncRewake === true
              ? Effect.forkDetach(
                superviseFork(runHookScript(hook, input, cwd, event, false), ctx, hook.command),
              ).pipe(Effect.asVoid)
              : runHookScript(hook, input, cwd, event).pipe(Effect.asVoid),
          { discard: true },
        ),
      { discard: true },
    )
  },
)
