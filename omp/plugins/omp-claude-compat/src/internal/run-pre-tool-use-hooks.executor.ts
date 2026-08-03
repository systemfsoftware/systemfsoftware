import {
  denormalizeToolInput,
  editTargetPaths,
  extractShellCommand,
  normalizeToolInput,
  normalizeToolName,
  sessionIds,
} from '@systemfsoftware/omp-utils'
import { Context, Effect, Option, type Scope } from 'effect'
import type { HookSettings } from '../hook-settings.acl.js'
import { asToolInput, EMPTY_TOOL_INPUT } from './hook-payload.kernel.js'
import type { HookSession, HookToolCall } from './hook-session.kernel.js'
import type { HooksForEventResult } from './run-hooks-for-event.executor.js'
import { runHooksForEvent } from './run-hooks-for-event.executor.js'

export class RunPreToolUseHooksExecutorDeps extends Context.Tag('RunPreToolUseHooksExecutorDeps')<
  RunPreToolUseHooksExecutorDeps,
  Scope.Scope
>() {}

export const runPreToolUseHooks = Effect.fn('runPreToolUseHooks')(function*(
  settings: HookSettings,
  event: HookToolCall,
  ctx: HookSession,
) {
  const claudeToolName = normalizeToolName(event.toolName)
  const sessionData = sessionIds(() => ctx.sessionManager.getSessionId())
  const rawInput = Option.getOrElse(asToolInput(event.input), () => EMPTY_TOOL_INPUT)
  const toolInput = normalizeToolInput(claudeToolName, rawInput)

  const shellCommand = extractShellCommand(event.toolName, rawInput)
  if (shellCommand !== undefined && shellCommand.length > 0) {
    const bashInput: Record<string, unknown> = {
      ...sessionData,
      tool_name: 'Bash',
      tool_input: { command: shellCommand },
      tool_call_id: event.toolCallId,
    }
    const bashResult = yield* runHooksForEvent(settings.hooks.PreToolUse, 'Bash', bashInput, ctx, 'PreToolUse')
    if (bashResult.block === true) {
      return bashResult.reason === undefined
        ? { block: true }
        : { block: true, reason: bashResult.reason }
    }
  }

  // One OMP `edit` can name many files; Claude Code's `Edit` names exactly one.
  // Dispatch the chain once per target so a guard sees every path: populating
  // only the first lets an innocent leading section screen a forbidden one.
  const targets = editTargetPaths(claudeToolName, toolInput)
  const payloads = targets.length === 0
    ? [toolInput]
    : targets.map((file_path) => ({ ...toolInput, file_path }))

  let lastResult: HooksForEventResult = {}
  for (const payload of payloads) {
    const input: Record<string, unknown> = {
      ...sessionData,
      tool_name: claudeToolName,
      tool_input: payload,
      tool_call_id: event.toolCallId,
    }

    const result = yield* runHooksForEvent(settings.hooks.PreToolUse, claudeToolName, input, ctx, 'PreToolUse')

    if (result.block === true) {
      return result.reason === undefined
        ? { block: true }
        : { block: true, reason: result.reason }
    }
    lastResult = result
  }

  // Only a single-target call has an unambiguous rewrite target, and the delta
  // must go back under the key names OMP reads — the forward pass renamed them.
  const updated = payloads.length === 1 ? lastResult.updatedInput?.['tool_input'] : undefined
  // Merged in place: OMP reads the rewrite back off the very object it passed.
  Object.assign(event.input, denormalizeToolInput(rawInput, updated))

  return undefined
})
