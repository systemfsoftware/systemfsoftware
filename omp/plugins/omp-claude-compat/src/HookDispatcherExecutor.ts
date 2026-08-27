import type {
  InputEventResult,
  ToolCallEventResult,
  ToolResultEvent,
  ToolResultEventResult,
} from '@oh-my-pi/pi-coding-agent'
import { Cell } from '@systemfsoftware/effect-cell-types'
import { Effect, Match, Option, pipe, Result, type Scope } from 'effect'
import type { FileSystem } from 'effect/FileSystem'
import type { PlatformError } from 'effect/PlatformError'
import type { ChildProcessSpawner } from 'effect/unstable/process/ChildProcessSpawner'
import { ClaudeSettings } from './ClaudeSettings.js'
import {
  type AdmitCommand,
  type AdmitError,
  admitLoadedSettings,
  admitPresent,
  type HookDispatchDecision,
  skipHooks,
} from './HookDispatch.workflow.js'
import type { HookSettings } from './HookSettings.schema.js'
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

const settingsFor = (ctx: HookSession) => Effect.flatMap(ClaudeSettings, (port) => port.load(ctx.cwd, ctx.homeDir))

interface SettingsAdmitPhases<Response> extends Cell.Phases {
  readonly command: HookSession
  readonly raw: HookSettings | null
  readonly decoded: AdmitCommand
  readonly decision: HookDispatchDecision
  readonly decisionError: AdmitError
  readonly output: HookDispatchDecision
  readonly response: Response
  readonly decodeError: never
  readonly readError: never
  readonly writeError: PlatformError
  readonly readContext: HookDispatchContext
  readonly writeContext: HookDispatchContext
}

const admitSettings = <Response>(
  write: (settings: HookSettings) => Effect.Effect<Response, PlatformError, HookDispatchContext>,
  empty: Response,
) => {
  let loaded: Option.Option<HookSettings> = Option.none()
  return pipe(
    Cell.read<SettingsAdmitPhases<Response>>((ctx) => settingsFor(ctx)),
    Cell.decode<SettingsAdmitPhases<Response>>((settings) => {
      loaded = Option.fromNullishOr(settings)
      return Result.succeed(admitPresent(Option.isSome(loaded)))
    }),
    Cell.decide<SettingsAdmitPhases<Response>>(admitLoadedSettings),
    Cell.encode<SettingsAdmitPhases<Response>>((outcome) => Result.getOrElse(outcome, skipHooks)),
    Cell.write<SettingsAdmitPhases<Response>>((decision) =>
      Match.value(decision).pipe(
        Match.tag('SkipHooks', () => Effect.succeed(empty)),
        Match.tag('RunHooks', () => write(Option.getOrThrow(loaded))),
        Match.exhaustive,
      )
    ),
  )
}

export const onToolCall = (event: HookToolCall, ctx: HookSession) =>
  Cell.apply(admitSettings((settings) => runPreToolUseHooks(settings, event, ctx), undefined), ctx)

export const onToolResult = (event: ToolResultEvent, ctx: HookSession) =>
  Cell.apply(
    admitSettings(
      (settings) =>
        Effect.gen(function*() {
          const result = yield* runToolResultHooks(settings, event, ctx)
          if (result.warning === undefined) return undefined
          return {
            content: [...event.content, { type: 'text' as const, text: result.warning }],
            isError: event.isError,
          }
        }),
      undefined,
    ),
    ctx,
  )

export const onPrompt = (event: HookPrompt, ctx: HookSession) =>
  Cell.apply(admitSettings((settings) => runUserPromptSubmitHooks(settings, event, ctx), undefined), ctx)

export const onSessionStart = (reason: string, ctx: HookSession) =>
  Effect.gen(function*() {
    const gaps = yield* (yield* ClaudeSettings).gaps(ctx.cwd, ctx.homeDir)
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
    return yield* Cell.apply(
      admitSettings((settings) => runSessionStartHooks(settings, reason, ctx), undefined),
      ctx,
    )
  })

export const onSessionCompact = (ctx: HookSession) =>
  Cell.apply(
    admitSettings(
      (settings) =>
        Effect.gen(function*() {
          yield* runSessionStartHooks(settings, 'compact', ctx)
          yield* runLifecycleHooks(settings.hooks.PostCompact, ctx, 'PostCompact')
        }),
      undefined,
    ),
    ctx,
  )

export const onPreCompact = (ctx: HookSession) =>
  Cell.apply(
    admitSettings(
      (settings) =>
        Effect.gen(function*() {
          const result = yield* runPreCompactHooks(settings, ctx)
          if (result.block !== true) return undefined
          ctx.ui.notify(
            `Compaction cancelled by a PreCompact hook: ${result.reason ?? 'no reason given'}`,
            'warning',
          )
          return { cancel: true as const }
        }),
      undefined,
    ),
    ctx,
  )

export const onSessionSwitch = (reason: string, ctx: HookSession) =>
  Cell.apply(admitSettings((settings) => runSessionSwitchHooks(settings, reason, ctx), undefined), ctx)

export const onSessionShutdown = (ctx: HookSession) =>
  Cell.apply(
    admitSettings((settings) => runLifecycleHooks(settings.hooks.SessionEnd, ctx, 'SessionEnd'), undefined),
    ctx,
  )

export const onSessionStop = (ctx: HookSession) =>
  Cell.apply(
    admitSettings((settings) => runLifecycleHooks(settings.hooks.Stop, ctx, 'Stop'), undefined),
    ctx,
  )
