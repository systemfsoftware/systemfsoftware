import { Context, Effect, type Scope } from 'effect'
import type { HookSettings } from '../hook-settings.acl.js'
import type { HookSession, HookToolResult } from './hook-session.kernel.js'
import { runPostToolUseFailureHooks } from './run-post-tool-use-failure-hooks.executor.js'
import { runPostToolUseHooks } from './run-post-tool-use-hooks.executor.js'

export class RunToolResultHooksExecutorDeps extends Context.Tag('RunToolResultHooksExecutorDeps')<
  RunToolResultHooksExecutorDeps,
  Scope.Scope
>() {}

export const runToolResultHooks = Effect.fn('runToolResultHooks')(function*(
  settings: HookSettings,
  event: HookToolResult,
  ctx: HookSession,
) {
  return event.isError === true
    ? yield* runPostToolUseFailureHooks(settings, event, ctx)
    : yield* runPostToolUseHooks(settings, event, ctx)
})
