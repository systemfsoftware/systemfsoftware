import type {
  InputEventResult,
  ToolCallEventResult,
  ToolResultEvent,
  ToolResultEventResult,
} from '@oh-my-pi/pi-coding-agent'
import { Effect, Match, type Scope } from 'effect'
import type { FileSystem } from 'effect/FileSystem'
import type { ChildProcessSpawner } from 'effect/unstable/process/ChildProcessSpawner'
import { homedir } from 'node:os'
import { collectSettingsGapsWithPaths } from './internal/CollectSettingsGapsExecutor.js'
import { CollectSettingsGapsExecutorDeps } from './internal/CollectSettingsGapsExecutor.js'
import type { HookPrompt, HookSession, HookToolCall } from './internal/HookSession.js'
import { loadSettingsWithPaths } from './internal/LoadSettingsExecutor.js'
import { LoadSettingsExecutorDeps } from './internal/LoadSettingsExecutor.js'
import { RunHookScriptExecutorDeps } from './internal/RunHookScriptExecutor.js'
import { RunHooksForEventExecutorDeps } from './internal/RunHooksForEventExecutor.js'
import { runLifecycleHooks } from './internal/RunLifecycleHooksExecutor.js'
import { RunLifecycleHooksExecutorDeps } from './internal/RunLifecycleHooksExecutor.js'
import { RunPostToolUseFailureHooksExecutorDeps } from './internal/RunPostToolUseFailureHooksExecutor.js'
import { RunPostToolUseHooksExecutorDeps } from './internal/RunPostToolUseHooksExecutor.js'
import { RunPreCompactHooksExecutorDeps } from './internal/RunPreCompactHooksExecutor.js'
import { runPreCompactHooks } from './internal/RunPreCompactHooksExecutor.js'
import { RunPreToolUseHooksExecutorDeps } from './internal/RunPreToolUseHooksExecutor.js'
import { runPreToolUseHooks } from './internal/RunPreToolUseHooksExecutor.js'
import { RunSessionStartHooksExecutorDeps } from './internal/RunSessionStartHooksExecutor.js'
import { runSessionStartHooks } from './internal/RunSessionStartHooksExecutor.js'
import { RunSessionSwitchHooksExecutorDeps } from './internal/RunSessionSwitchHooksExecutor.js'
import { runSessionSwitchHooks } from './internal/RunSessionSwitchHooksExecutor.js'
import { RunToolResultHooksExecutorDeps } from './internal/RunToolResultHooksExecutor.js'
import { runToolResultHooks } from './internal/RunToolResultHooksExecutor.js'
import { RunUserPromptSubmitHooksExecutorDeps } from './internal/RunUserPromptSubmitHooksExecutor.js'
import { runUserPromptSubmitHooks } from './internal/RunUserPromptSubmitHooksExecutor.js'
import { settingsPaths } from './internal/SettingsPaths.js'
import { SuperviseForkExecutorDeps } from './internal/SuperviseForkExecutor.js'

export type HookToolCallCommand = {
  readonly _tag: 'ToolCall'
  readonly event: HookToolCall
  readonly ctx: HookSession
}

export type HookToolResultCommand = {
  readonly _tag: 'ToolResult'
  readonly event: ToolResultEvent
  readonly ctx: HookSession
}

export type HookPromptCommand = {
  readonly _tag: 'Prompt'
  readonly event: HookPrompt
  readonly ctx: HookSession
}

export type HookSessionStartCommand = {
  readonly _tag: 'SessionStart'
  readonly reason: string
  readonly ctx: HookSession
}

export type HookSessionCompactCommand = {
  readonly _tag: 'SessionCompact'
  readonly ctx: HookSession
}

export type HookPreCompactCommand = {
  readonly _tag: 'PreCompact'
  readonly ctx: HookSession
}

export type HookSessionSwitchCommand = {
  readonly _tag: 'SessionSwitch'
  readonly reason: string
  readonly ctx: HookSession
}

export type HookSessionShutdownCommand = {
  readonly _tag: 'SessionShutdown'
  readonly ctx: HookSession
}

export type HookSessionStopCommand = {
  readonly _tag: 'SessionStop'
  readonly ctx: HookSession
}

export type HookEventCommand =
  | HookToolCallCommand
  | HookToolResultCommand
  | HookPromptCommand
  | HookSessionStartCommand
  | HookSessionCompactCommand
  | HookPreCompactCommand
  | HookSessionSwitchCommand
  | HookSessionShutdownCommand
  | HookSessionStopCommand

export type HookDispatchResult =
  | ToolCallEventResult
  | ToolResultEventResult
  | InputEventResult
  | { readonly cancel: boolean }
  | undefined

export type HookDispatchContext =
  | FileSystem
  | ChildProcessSpawner
  | Scope.Scope
  | LoadSettingsExecutorDeps
  | CollectSettingsGapsExecutorDeps
  | RunHookScriptExecutorDeps
  | RunHooksForEventExecutorDeps
  | RunPreToolUseHooksExecutorDeps
  | RunPostToolUseHooksExecutorDeps
  | RunPostToolUseFailureHooksExecutorDeps
  | RunToolResultHooksExecutorDeps
  | RunPreCompactHooksExecutorDeps
  | RunUserPromptSubmitHooksExecutorDeps
  | RunSessionStartHooksExecutorDeps
  | RunSessionSwitchHooksExecutorDeps
  | RunLifecycleHooksExecutorDeps
  | SuperviseForkExecutorDeps

export const dispatchHookEvent = (cmd: HookEventCommand) =>
  Effect.gen(function*() {
    const matched = Match.value(cmd).pipe(
      Match.tag('ToolCall', ({ event, ctx }) =>
        Effect.gen(function*() {
          const settings = yield* loadSettingsWithPaths(settingsPaths(homedir(), ctx.cwd))
          if (!settings) return undefined as HookDispatchResult
          return (yield* runPreToolUseHooks(settings, event, ctx))
        })),
      Match.tag('ToolResult', ({ event, ctx }) =>
        Effect.gen(function*() {
          const settings = yield* loadSettingsWithPaths(settingsPaths(homedir(), ctx.cwd))
          if (!settings) return undefined as HookDispatchResult
          const result = yield* runToolResultHooks(settings, event, ctx)
          if (result.warning !== undefined) {
            return {
              content: [...event.content, { type: 'text' as const, text: result.warning }],
              isError: event.isError,
            }
          }
          return undefined as HookDispatchResult
        })),
      Match.tag('Prompt', ({ event, ctx }) =>
        Effect.gen(function*() {
          const settings = yield* loadSettingsWithPaths(settingsPaths(homedir(), ctx.cwd))
          if (!settings) return undefined as HookDispatchResult
          return (yield* runUserPromptSubmitHooks(settings, event, ctx))
        })),
      Match.tag('SessionStart', ({ reason, ctx }) =>
        Effect.gen(function*() {
          const gaps = yield* collectSettingsGapsWithPaths(settingsPaths(homedir(), ctx.cwd))
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
          const settings = yield* loadSettingsWithPaths(settingsPaths(homedir(), ctx.cwd))
          if (!settings) return undefined as HookDispatchResult
          yield* runSessionStartHooks(settings, reason, ctx)
          return undefined
        })),
      Match.tag('SessionCompact', ({ ctx }) =>
        Effect.gen(function*() {
          const settings = yield* loadSettingsWithPaths(settingsPaths(homedir(), ctx.cwd))
          if (!settings) return undefined as HookDispatchResult
          yield* runSessionStartHooks(settings, 'compact', ctx)
          yield* runLifecycleHooks(settings.hooks.PostCompact, ctx, 'PostCompact')
          return undefined
        })),
      Match.tag('PreCompact', ({ ctx }) =>
        Effect.gen(function*() {
          const settings = yield* loadSettingsWithPaths(settingsPaths(homedir(), ctx.cwd))
          if (!settings) return undefined as HookDispatchResult
          const result = yield* runPreCompactHooks(settings, ctx)
          if (result.block !== true) return undefined
          ctx.ui.notify(
            `Compaction cancelled by a PreCompact hook: ${result.reason ?? 'no reason given'}`,
            'warning',
          )
          return { cancel: true }
        })),
      Match.tag('SessionSwitch', ({ reason, ctx }) =>
        Effect.gen(function*() {
          const settings = yield* loadSettingsWithPaths(settingsPaths(homedir(), ctx.cwd))
          if (!settings) return undefined as HookDispatchResult
          yield* runSessionSwitchHooks(settings, reason, ctx)
          return undefined
        })),
      Match.tag('SessionShutdown', ({ ctx }) =>
        Effect.gen(function*() {
          const settings = yield* loadSettingsWithPaths(settingsPaths(homedir(), ctx.cwd))
          if (!settings) return undefined as HookDispatchResult
          yield* runLifecycleHooks(settings.hooks.SessionEnd, ctx, 'SessionEnd')
          return undefined
        })),
      Match.tag('SessionStop', ({ ctx }) =>
        Effect.gen(function*() {
          const settings = yield* loadSettingsWithPaths(settingsPaths(homedir(), ctx.cwd))
          if (!settings) return undefined as HookDispatchResult
          yield* runLifecycleHooks(settings.hooks.Stop, ctx, 'Stop')
          return undefined
        })),
      Match.exhaustive,
    )
    return (yield* matched)
  })
