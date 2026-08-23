import { Context, Effect, type Scope } from 'effect'
import type { HookSettings } from '../HookSettings.schema.js'
import type { FeedbackOnlyResult } from './HookFeedback.js'
import type { HookSession, HookToolResult } from './HookSession.js'
import { runPostToolUseFailureHooks } from './RunPostToolUseFailureHooksExecutor.js'
import { runPostToolUseHooks } from './RunPostToolUseHooksExecutor.js'

/** @internal */
export class RunToolResultHooksExecutorDeps extends Context.Service<RunToolResultHooksExecutorDeps, Scope.Scope>()(
  'RunToolResultHooksExecutorDeps',
) {}

/** @internal */
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
