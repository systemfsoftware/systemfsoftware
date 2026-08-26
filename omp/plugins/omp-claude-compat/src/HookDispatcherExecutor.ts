import type {
  InputEventResult,
  ToolCallEventResult,
  ToolResultEvent,
  ToolResultEventResult,
} from '@oh-my-pi/pi-coding-agent'
import { Effect, type Scope } from 'effect'
import type { FileSystem } from 'effect/FileSystem'
import type { ChildProcessSpawner } from 'effect/unstable/process/ChildProcessSpawner'
import { ClaudeSettings } from './ClaudeSettings.js'
import type { HookPrompt, HookSession, HookToolCall } from './internal/HookSession.js'
import { runLifecycleHooks } from './internal/RunLifecycleHooksExecutor.js'
import { runPreCompactHooks } from './internal/RunPreCompactHooksExecutor.js'
import { runPreToolUseHooks } from './internal/RunPreToolUseHooksExecutor.js'
import { runSessionStartHooks } from './internal/RunSessionStartHooksExecutor.js'
import { runSessionSwitchHooks } from './internal/RunSessionSwitchHooksExecutor.js'
import { runToolResultHooks } from './internal/RunToolResultHooksExecutor.js'
import { runUserPromptSubmitHooks } from './internal/RunUserPromptSubmitHooksExecutor.js'

export type HookDispatchResult =
  | ToolCallEventResult
  | ToolResultEventResult
  | InputEventResult
  | { readonly cancel: boolean }
  | undefined

export type HookDispatchContext = FileSystem | ChildProcessSpawner | Scope.Scope | ClaudeSettings

const settingsFor = (ctx: HookSession) => Effect.flatMap(ClaudeSettings, (port) => port.load(ctx.cwd))

export const onToolCall = (event: HookToolCall, ctx: HookSession) =>
  Effect.gen(function*() {
    const settings = yield* settingsFor(ctx)
    if (!settings) return undefined
    return yield* runPreToolUseHooks(settings, event, ctx)
  })

export const onToolResult = (event: ToolResultEvent, ctx: HookSession) =>
  Effect.gen(function*() {
    const settings = yield* settingsFor(ctx)
    if (!settings) return undefined
    const result = yield* runToolResultHooks(settings, event, ctx)
    if (result.warning === undefined) return undefined
    return {
      content: [...event.content, { type: 'text' as const, text: result.warning }],
      isError: event.isError,
    }
  })

export const onPrompt = (event: HookPrompt, ctx: HookSession) =>
  Effect.gen(function*() {
    const settings = yield* settingsFor(ctx)
    if (!settings) return undefined
    return yield* runUserPromptSubmitHooks(settings, event, ctx)
  })

export const onSessionStart = (reason: string, ctx: HookSession) =>
  Effect.gen(function*() {
    const gaps = yield* (yield* ClaudeSettings).gaps(ctx.cwd)
    const coverageLines = [
      ...gaps.coverage.unrecognized.map((row) => `  ${row.event}: ${row.reason}`),
      ...gaps.coverage.notCarried.map((row) => `  ${row.event}: not carried by this bridge — ${row.reason}`),
      ...gaps.coverage.matcherNotEvaluable.map(
        (row) => `  ${row.event}: hook skipped, matcher not evaluable — ${row.reason}`,
      ),
      ...gaps.coverage.matcherOutOfReach.map((row) => `  ${row.event}: ${row.reason}`),
      ...gaps.coverage.shadowed.map((row) => `  ${row.event}: ${row.reason}`),
      ...gaps.coverage.disabled.map((row) => `  ${row.event}: ${row.reason}`),
    ]
    if (coverageLines.length > 0) {
      ctx.ui.notify(
        `Hook coverage — configured hooks this bridge will not run:\n${coverageLines.join('\n')}`,
        'warning',
      )
    }
    if (gaps.unsupportedHookTypes.length > 0) {
      ctx.ui.notify(
        `Skipping hook(s) this bridge cannot run yet: type ${gaps.unsupportedHookTypes.join(', ')}`,
        'warning',
      )
    }
    if (gaps.malformedFiles.length > 0) {
      ctx.ui.notify(
        `Hooks are NOT running from malformed settings file(s): ${gaps.malformedFiles.join(', ')}`,
        'error',
      )
    }
    const settings = yield* settingsFor(ctx)
    if (!settings) return
    yield* runSessionStartHooks(settings, reason, ctx)
  })

export const onSessionCompact = (ctx: HookSession) =>
  Effect.gen(function*() {
    const settings = yield* settingsFor(ctx)
    if (!settings) return
    yield* runSessionStartHooks(settings, 'compact', ctx)
    yield* runLifecycleHooks(settings.hooks.PostCompact, ctx, 'PostCompact')
  })

export const onPreCompact = (ctx: HookSession) =>
  Effect.gen(function*() {
    const settings = yield* settingsFor(ctx)
    if (!settings) return undefined
    const result = yield* runPreCompactHooks(settings, ctx)
    if (result.block !== true) return undefined
    ctx.ui.notify(
      `Compaction cancelled by a PreCompact hook: ${result.reason ?? 'no reason given'}`,
      'warning',
    )
    return { cancel: true }
  })

export const onSessionSwitch = (reason: string, ctx: HookSession) =>
  Effect.gen(function*() {
    const settings = yield* settingsFor(ctx)
    if (!settings) return
    yield* runSessionSwitchHooks(settings, reason, ctx)
  })

export const onSessionShutdown = (ctx: HookSession) =>
  Effect.gen(function*() {
    const settings = yield* settingsFor(ctx)
    if (!settings) return
    yield* runLifecycleHooks(settings.hooks.SessionEnd, ctx, 'SessionEnd')
  })

export const onSessionStop = (ctx: HookSession) =>
  Effect.gen(function*() {
    const settings = yield* settingsFor(ctx)
    if (!settings) return
    yield* runLifecycleHooks(settings.hooks.Stop, ctx, 'Stop')
  })
