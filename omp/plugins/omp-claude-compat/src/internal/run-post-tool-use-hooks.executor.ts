import { editTargetPaths, sessionIds } from '@systemfsoftware/omp-utils'
import { normalizeToolInput, normalizeToolName } from '@systemfsoftware/omp-utils/tool'
import { Context, Effect, Option, type Scope } from 'effect'
import type { HookSettings } from '../hook-settings.acl.js'
import { blockAsFeedback, type FeedbackOnlyResult } from './hook-feedback.kernel.js'
import { asToolInput, EMPTY_TOOL_INPUT } from './hook-payload.kernel.js'
import type { HookSession, HookToolResult } from './hook-session.kernel.js'
import { runHooksForEvent } from './run-hooks-for-event.executor.js'

export class RunPostToolUseHooksExecutorDeps extends Context.Tag('RunPostToolUseHooksExecutorDeps')<
  RunPostToolUseHooksExecutorDeps,
  Scope.Scope
>() {}

export const runPostToolUseHooks = Effect.fn('runPostToolUseHooks')(function*(
  settings: HookSettings,
  event: HookToolResult,
  ctx: HookSession,
) {
  const claudeToolName = normalizeToolName(event.toolName)
  const sessionData = sessionIds(() => ctx.sessionManager.getSessionId())
  const toolInput = normalizeToolInput(
    claudeToolName,
    Option.getOrElse(asToolInput(event.input), () => EMPTY_TOOL_INPUT),
  )
  const targets = editTargetPaths(claudeToolName, toolInput)
  const payloads = targets.length === 0
    ? [toolInput]
    : targets.map((file_path) => ({ ...toolInput, file_path }))

  let firstWarning: string | undefined
  let lastResult: FeedbackOnlyResult = {}
  for (const payload of payloads) {
    const input: Record<string, unknown> = {
      ...sessionData,
      tool_name: claudeToolName,
      tool_input: payload,
      tool_call_id: event.toolCallId,
      output: event.content,
      is_error: event.isError ?? false,
    }

    const result = yield* runHooksForEvent(settings.hooks.PostToolUse, claudeToolName, input, ctx, 'PostToolUse')
    if (result.block === true) return blockAsFeedback(result)
    if (firstWarning === undefined) firstWarning = result.warning
    lastResult = result
  }

  return firstWarning === undefined ? lastResult : { ...lastResult, warning: firstWarning }
})
