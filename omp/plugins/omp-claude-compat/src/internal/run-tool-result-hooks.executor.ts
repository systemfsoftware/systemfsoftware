import { Context, Effect, type Scope } from 'effect'
import type { HookSettings } from '../hook-settings.schema.js'
import type { FeedbackOnlyResult } from './hook-feedback.kernel.js'
import type { HookSession, HookToolResult } from './hook-session.kernel.js'
import { runPostToolUseFailureHooks } from './run-post-tool-use-failure-hooks.executor.js'
import { runPostToolUseHooks } from './run-post-tool-use-hooks.executor.js'

export class RunToolResultHooksExecutorDeps extends Context.Service<RunToolResultHooksExecutorDeps, Scope.Scope>()(
  'RunToolResultHooksExecutorDeps',
) {}

export const runToolResultHooks = Effect.fn('runToolResultHooks')(function*(
  settings: HookSettings,
  event: HookToolResult,
  ctx: HookSession,
) {
  const feedback: FeedbackOnlyResult = event.isError === true
    ? yield* runPostToolUseFailureHooks(settings, event, ctx)
    : yield* runPostToolUseHooks(settings, event, ctx)
  return feedback
})
