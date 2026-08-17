import { normalizeToolInput, normalizeToolName, sessionIds } from '@systemfsoftware/omp-utils'
import { Context, Effect, Option, Schema as S, type Scope } from 'effect'
import type { HookSettings } from '../hook-settings.schema.js'
import { blockAsFeedback, type FeedbackOnlyResult } from './hook-feedback.kernel.js'
import { asToolInput, EMPTY_TOOL_INPUT } from './hook-payload.kernel.js'
import type { HookSession, HookToolResult } from './hook-session.kernel.js'
import { runHooksForEvent } from './run-hooks-for-event.executor.js'

export class RunPostToolUseFailureHooksExecutorDeps
  extends Context.Service<RunPostToolUseFailureHooksExecutorDeps, Scope.Scope>()(
    'RunPostToolUseFailureHooksExecutorDeps',
  )
{}

const asTextBlocks = S.decodeUnknownOption(S.Array(S.Struct({ text: S.optional(S.String) })))
const asPlainText = S.decodeUnknownOption(S.String)

/** Claude Code documents `error` as a string; OMP carries content blocks. */
const errorText = (content: unknown): string =>
  Option.match(asTextBlocks(content), {
    onSome: (blocks) => blocks.flatMap((block) => block.text === undefined ? [] : [block.text]).join('\n'),
    onNone: () => Option.getOrElse(asPlainText(content), () => ''),
  })

export const runPostToolUseFailureHooks = Effect.fn('runPostToolUseFailureHooks')(function*(
  settings: HookSettings,
  event: HookToolResult,
  ctx: HookSession,
) {
  const claudeToolName = normalizeToolName(event.toolName)
  const toolInput = normalizeToolInput(
    claudeToolName,
    Option.getOrElse(asToolInput(event.input), () => EMPTY_TOOL_INPUT),
  )
  // No per-target fan-out: a tool that failed edited nothing.
  const input: Record<string, unknown> = {
    ...sessionIds(() => ctx.sessionManager.getSessionId()),
    tool_name: claudeToolName,
    tool_input: toolInput,
    tool_use_id: event.toolCallId,
    error: errorText(event.content),
  }

  const result = yield* runHooksForEvent(
    settings.hooks.PostToolUseFailure,
    claudeToolName,
    input,
    ctx,
    'PostToolUseFailure',
  )
  const feedback: FeedbackOnlyResult = result.block === true ? blockAsFeedback(result) : result
  return feedback
})
