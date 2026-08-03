import type { ExtensionAPI, InputEvent, ToolCallEvent, ToolResultEvent } from '@oh-my-pi/pi-coding-agent'
import type { InputEventResult, ToolCallEventResult, ToolResultEventResult } from '@oh-my-pi/pi-coding-agent'
import { Cause, Effect, Either, Exit, Option } from 'effect'
import { dispatchHookEvent } from './hook-dispatcher.executor.js'
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
} from './hook-dispatcher.executor.js'

const HANDLER_CEILING_MS = 28_000

export const HookDispatcherTask = (pi: ExtensionAPI): void => {
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
    const runtime = await import('./hook-runtime.state.js').then((mod) => mod.default)
    const exited = Effect.gen(function*() {
      const outcome = yield* Effect.either(dispatchHookEvent(cmd))
      if (Either.isLeft(outcome)) throw outcome.left
      return outcome.right
    }).pipe(Effect.timeoutOption(HANDLER_CEILING_MS), Effect.exit)
    const exit = await runtime.runPromise(exited)
    if (Exit.isFailure(exit)) throw Cause.squash(exit.cause)
    return Option.getOrUndefined(exit.value)
  }

  pi.on('tool_call', (event: ToolCallEvent, ctx) => dispatch({ _tag: 'ToolCall', event, ctx }))
  pi.on('tool_result', (event: ToolResultEvent, ctx) => dispatch({ _tag: 'ToolResult', event, ctx }))
  pi.on('input', (event: InputEvent, ctx) => dispatch({ _tag: 'Prompt', event, ctx }))
  pi.on('session_start', (_event, ctx) => dispatch({ _tag: 'SessionStart', reason: 'startup', ctx }))
  pi.on('session_compact', (_event, ctx) => dispatch({ _tag: 'SessionCompact', ctx }))
  pi.on('session_before_compact', (_event, ctx) => dispatch({ _tag: 'PreCompact', ctx }))
  pi.on('session_switch', (event, ctx) => dispatch({ _tag: 'SessionSwitch', reason: event.reason, ctx }))
  pi.on('session_shutdown', async (_event, ctx) => {
    const runtime = await import('./hook-runtime.state.js').then((mod) => mod.default)
    try {
      return await dispatch({ _tag: 'SessionShutdown', ctx })
    } finally {
      await runtime.dispose()
    }
  })
  pi.on('session_stop', (_event, ctx) => dispatch({ _tag: 'SessionStop', ctx }))
}
