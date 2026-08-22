import type { ExtensionAPI, InputEvent, ToolCallEvent, ToolResultEvent } from '@oh-my-pi/pi-coding-agent'
import type { InputEventResult, ToolCallEventResult, ToolResultEventResult } from '@oh-my-pi/pi-coding-agent'
import { Effect, Option, Result } from 'effect'
import {
  dispatchHookEvent,
  type HookDispatchContext,
  HookPreCompactTag,
  HookPromptTag,
  HookSessionCompactTag,
  HookSessionShutdownTag,
  HookSessionStartTag,
  HookSessionStopTag,
  HookSessionSwitchTag,
  HookToolCallTag,
  HookToolResultTag,
} from './HookDispatcherExecutor.js'
import type {
  HookEventCommand,
  HookPreCompactCommand,
  HookPromptCommand,
  HookSessionCompactCommand,
  HookSessionShutdownCommand,
  HookSessionStartCommand,
  HookSessionStopCommand,
  HookSessionSwitchCommand,
  HookToolCallCommand,
  HookToolResultCommand,
} from './HookDispatcherExecutor.js'
import type { HookRunner } from './HookRunner.js'

const HANDLER_CEILING_MS = 28_000

export const HookDispatcherTask = (pi: ExtensionAPI, runner: HookRunner<HookDispatchContext>): void => {
  async function dispatch(cmd: HookToolCallCommand): Promise<ToolCallEventResult | undefined>
  async function dispatch(cmd: HookToolResultCommand): Promise<ToolResultEventResult | undefined>
  async function dispatch(cmd: HookPromptCommand): Promise<InputEventResult | undefined>
  async function dispatch(cmd: HookSessionStartCommand): Promise<undefined>
  async function dispatch(cmd: HookSessionCompactCommand): Promise<undefined>
  async function dispatch(cmd: HookPreCompactCommand): Promise<{ readonly cancel: boolean } | undefined>
  async function dispatch(cmd: HookSessionSwitchCommand): Promise<undefined>
  async function dispatch(cmd: HookSessionShutdownCommand): Promise<undefined>
  async function dispatch(cmd: HookSessionStopCommand): Promise<undefined>
  async function dispatch(cmd: HookEventCommand): Promise<unknown> {
    const timed = Effect.gen(function*() {
      const outcome = yield* Effect.result(dispatchHookEvent(cmd))
      if (Result.isFailure(outcome)) throw outcome.failure
      return outcome.success
    }).pipe(Effect.timeoutOption(HANDLER_CEILING_MS))
    return Option.getOrUndefined(await runner.runSafe(timed))
  }

  pi.on('tool_call', (event: ToolCallEvent, ctx) => dispatch({ ...HookToolCallTag, event, ctx }))
  pi.on('tool_result', (event: ToolResultEvent, ctx) => dispatch({ ...HookToolResultTag, event, ctx }))
  pi.on('input', (event: InputEvent, ctx) => dispatch({ ...HookPromptTag, event, ctx }))
  pi.on('session_start', (_event, ctx) => dispatch({ ...HookSessionStartTag, reason: 'startup', ctx }))
  pi.on('session_compact', (_event, ctx) => dispatch({ ...HookSessionCompactTag, ctx }))
  pi.on('session_before_compact', (_event, ctx) => dispatch({ ...HookPreCompactTag, ctx }))
  pi.on('session_switch', (event, ctx) => dispatch({ ...HookSessionSwitchTag, reason: event.reason, ctx }))
  pi.on('session_shutdown', (_event, ctx) => dispatch({ ...HookSessionShutdownTag, ctx }))
  pi.on('session_stop', (_event, ctx) => dispatch({ ...HookSessionStopTag, ctx }))
}
