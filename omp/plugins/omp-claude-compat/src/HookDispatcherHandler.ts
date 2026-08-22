import type { ExtensionAPI, InputEvent, ToolCallEvent, ToolResultEvent } from '@oh-my-pi/pi-coding-agent'
import { Effect, Option, Result } from 'effect'
import {
  type HookDispatchContext,
  onPreCompact,
  onPrompt,
  onSessionCompact,
  onSessionShutdown,
  onSessionStart,
  onSessionStop,
  onSessionSwitch,
  onToolCall,
  onToolResult,
} from './HookDispatcherExecutor.js'
import type { HookRunner } from './HookRunner.js'

const HANDLER_CEILING_MS = 28_000

export const HookDispatcherTask = (pi: ExtensionAPI, runner: HookRunner<HookDispatchContext>): void => {
  /**
   * The ceiling and the failure re-raise are the same for every event, so they
   * are applied to the handler's own effect. Each `pi.on` registration already
   * names which handler runs, so its result type is the handler's, not a union.
   */
  const bounded = async <A, E>(effect: Effect.Effect<A, E, HookDispatchContext>): Promise<A | undefined> => {
    const timed = Effect.gen(function*() {
      const outcome = yield* Effect.result(effect)
      if (Result.isFailure(outcome)) throw outcome.failure
      return outcome.success
    }).pipe(Effect.timeoutOption(HANDLER_CEILING_MS))
    return Option.getOrUndefined(await runner.runSafe(timed))
  }

  pi.on('tool_call', (event: ToolCallEvent, ctx) => bounded(onToolCall(event, ctx)))
  pi.on('tool_result', (event: ToolResultEvent, ctx) => bounded(onToolResult(event, ctx)))
  pi.on('input', (event: InputEvent, ctx) => bounded(onPrompt(event, ctx)))
  pi.on('session_start', (_event, ctx) => bounded(onSessionStart('startup', ctx)))
  pi.on('session_compact', (_event, ctx) => bounded(onSessionCompact(ctx)))
  pi.on('session_before_compact', (_event, ctx) => bounded(onPreCompact(ctx)))
  pi.on('session_switch', (event, ctx) => bounded(onSessionSwitch(event.reason, ctx)))
  pi.on('session_shutdown', (_event, ctx) => bounded(onSessionShutdown(ctx)))
  pi.on('session_stop', (_event, ctx) => bounded(onSessionStop(ctx)))
}
