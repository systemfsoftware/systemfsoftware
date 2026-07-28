import { Command } from '@effect/platform'
import { CommandExecutor } from '@effect/platform/CommandExecutor'
import { FileSystem } from '@effect/platform/FileSystem'
import type { InputEvent, InputEventResult } from '@oh-my-pi/pi-coding-agent'
import {
  denormalizeToolInput,
  editTargetPaths,
  extractShellCommand,
  matchesMatcher,
  matchesPermissionRule,
  normalizeToolInput,
  normalizeToolName,
  sessionIds,
} from '@systemfsoftware/omp-utils'
import { Cause, Effect, Either, Match, Option, Schema as S, Stream } from 'effect'
import { homedir } from 'node:os'
import { drainAsyncHookOutput, recordAsyncHookOutput } from './async-hook-output.state.js'
import { NON_EVALUABLE_MATCHERS, TOOL_EVENTS } from './hook-catalog.schema.js'
import { Blocked, Continue, Warning } from './hook-dispatcher.schema.js'
import type { HookOutcome, HookResult } from './hook-dispatcher.schema.js'
import type { DisableSource, HookCoverage, HookCoverageRow } from './hook-settings.acl.js'
import {
  disabledCoverage,
  hookCoverage,
  mergeSettings,
  parseSettings,
  unsupportedHookTypes,
} from './hook-settings.acl.js'
import type { CommandHook, HookEntry, HookSettings, SettingsSource } from './hook-settings.acl.js'
import { interpretHookResult } from './hook-verdict.workflow.js'

const UNREADABLE_MATCHER: Readonly<Record<string, string>> = NON_EVALUABLE_MATCHERS
const IF_EVALUATING_EVENTS: readonly string[] = TOOL_EVENTS

const loadSettingsFile = Effect.fn('loadSettingsFile')(function*(path: string) {
  const fs = yield* FileSystem
  const content = yield* fs.readFileString(path).pipe(Effect.catchAll(() => Effect.succeed('')))
  if (content === '') return null
  const jsonOrError = S.decodeUnknownEither(S.parseJson(S.Record({ key: S.String, value: S.Unknown })))(content)
  if (Either.isLeft(jsonOrError)) return null
  const json = jsonOrError.right
  const either = parseSettings(json)
  return Either.isLeft(either) ? null : either.right
})

/** Enterprise policy. Hooks from here survive a `disableAllHooks` set anywhere else. */
const MANAGED_SETTINGS_PATH = '/etc/claude-code/managed-settings.json'

const settingsPaths = (cwd: string): readonly string[] => [
  `${homedir()}/.claude/settings.json`,
  `${cwd}/.claude/settings.json`,
  `${cwd}/.claude/settings.local.json`,
  MANAGED_SETTINGS_PATH,
]

export const loadSettings = Effect.fn('loadSettings')(function*(cwd: string) {
  return yield* loadSettingsWithPaths(settingsPaths(cwd))
})

export const loadSettingsWithPaths = Effect.fn('loadSettingsWithPaths')(function*(
  paths: readonly string[],
  managedPath: string = MANAGED_SETTINGS_PATH,
) {
  const sources: SettingsSource[] = []
  for (const p of paths) {
    const s = yield* loadSettingsFile(p)
    if (s !== null) sources.push({ settings: s, managed: p === managedPath })
  }
  if (sources.length === 0) return null
  return mergeSettings(sources)
})

const dedupeByEvent = (rows: readonly HookCoverageRow[]): readonly HookCoverageRow[] =>
  rows.filter((row, index) => rows.findIndex((other) => other.event === row.event) === index)

export const coverageReportLines = (coverage: HookCoverage): readonly string[] => [
  ...coverage.unrecognized.map((row) => `  ${row.event}: ${row.reason}`),
  ...coverage.notCarried.map((row) => `  ${row.event}: not carried by this bridge — ${row.reason}`),
  ...coverage.matcherNotEvaluable.map((row) => `  ${row.event}: hook skipped, matcher not evaluable — ${row.reason}`),
  ...coverage.matcherOutOfReach.map((row) => `  ${row.event}: ${row.reason}`),
  ...coverage.shadowed.map((row) => `  ${row.event}: ${row.reason}`),
  ...coverage.disabled.map((row) => `  ${row.event}: ${row.reason}`),
]

export const collectSettingsGapsWithPaths = Effect.fn('collectSettingsGapsWithPaths')(function*(
  paths: readonly string[],
  managedPath: string = MANAGED_SETTINGS_PATH,
) {
  const fs = yield* FileSystem
  const unrecognized: HookCoverageRow[] = []
  const notCarried: HookCoverageRow[] = []
  const matcherNotEvaluable: HookCoverageRow[] = []
  const matcherOutOfReach: HookCoverageRow[] = []
  const shadowed: HookCoverageRow[] = []
  const sources: DisableSource[] = []
  const hookTypes: string[] = []
  const malformed: string[] = []
  for (const path of paths) {
    const content = yield* fs.readFileString(path).pipe(Effect.catchAll(() => Effect.succeed('')))
    if (content === '') continue
    const parsed = S.decodeUnknownEither(S.parseJson(S.Record({ key: S.String, value: S.Unknown })))(content)
    if (Either.isLeft(parsed)) {
      malformed.push(path)
      continue
    }
    const coverage = hookCoverage(parsed.right)
    unrecognized.push(...coverage.unrecognized)
    notCarried.push(...coverage.notCarried)
    matcherNotEvaluable.push(...coverage.matcherNotEvaluable)
    matcherOutOfReach.push(...coverage.matcherOutOfReach)
    shadowed.push(...coverage.shadowed)
    hookTypes.push(...unsupportedHookTypes(parsed.right))
    // The loader skips a file it cannot decode, contributing no hooks at all.
    // Name it rather than starting the session unguarded with no sign of it.
    const settings = parseSettings(parsed.right)
    if (Either.isLeft(settings)) malformed.push(path)
    else sources.push({ settings: settings.right, managed: path === managedPath, label: path })
  }
  return {
    coverage: {
      unrecognized: dedupeByEvent(unrecognized),
      notCarried: dedupeByEvent(notCarried),
      matcherNotEvaluable: dedupeByEvent(matcherNotEvaluable),
      matcherOutOfReach: dedupeByEvent(matcherOutOfReach),
      shadowed: dedupeByEvent(shadowed),
      disabled: dedupeByEvent(disabledCoverage(sources)),
    },
    unsupportedHookTypes: Array.from(new Set(hookTypes)),
    malformedFiles: Array.from(new Set(malformed)),
  }
})

export const collectSettingsGaps = Effect.fn('collectSettingsGaps')(function*(cwd: string) {
  return yield* collectSettingsGapsWithPaths(settingsPaths(cwd))
})

/** Claude Code's documented per-event default; 600s for every other event. */
const DEFAULT_TIMEOUT_SECONDS: Record<string, number> = {
  UserPromptSubmit: 30,
}

const SHELL_INVOCATION = {
  sh: ['sh', '-c'],
  bash: ['bash', '-c'],
  powershell: ['powershell', '-Command'],
} as const satisfies Record<string, readonly [string, string]>

export const runHookScript = Effect.fn('runHookScript')(function*(
  hook: CommandHook,
  input: Record<string, unknown>,
  cwd: string,
  event: string,
) {
  const executor = yield* CommandExecutor
  const timeoutMs = (hook.timeout ?? DEFAULT_TIMEOUT_SECONDS[event] ?? 600) * 1000
  const stdinText = encodeHookPayload(input)

  // `args` selects the exec form: spawn the binary directly so no shell ever
  // interprets the command or its arguments. Otherwise the hook picks its own
  // interpreter, and running a bash hook under `sh` silently changes its
  // meaning wherever /bin/sh is not bash.
  const [shell, evalFlag] = SHELL_INVOCATION[hook.shell ?? 'sh']
  const base = hook.args === undefined
    ? Command.make(shell, evalFlag, hook.command)
    : Command.make(hook.command, ...hook.args)

  const hookCommand = base.pipe(
    Command.workingDirectory(cwd),
    Command.env({ OMP_PROJECT_DIR: cwd, CLAUDE_PROJECT_DIR: cwd }),
    Command.feed(stdinText),
    Command.stdout('pipe'),
    Command.stderr('pipe'),
  )

  return yield* Effect.scoped(
    Effect.gen(function*() {
      const process = yield* executor.start(hookCommand)

      // Collect stdout/stderr — streams complete when the process closes its pipes
      const stdout = yield* process.stdout.pipe(Stream.decodeText(), Stream.mkString)
      const stderr = yield* process.stderr.pipe(Stream.decodeText(), Stream.mkString)
      const exitCode = yield* process.exitCode

      const code = typeof exitCode === 'number' ? exitCode : Number(exitCode)
      return { code, stdout, stderr } satisfies HookResult
    }),
  ).pipe(
    Effect.timeout(timeoutMs),
    Effect.catchTag(
      'TimeoutException',
      () => Effect.succeed({ code: -1, stdout: '', stderr: `timeout after ${timeoutMs}ms` } satisfies HookResult),
    ),
  )
})
const EMPTY_TOOL_INPUT: Record<string, unknown> = {}

const ToolInputRecord = S.Record({ key: S.String, value: S.Unknown })

const asToolInput = S.decodeUnknownOption(ToolInputRecord)

/** The hook payload's wire contract, declared once and used in both directions. */
const encodeHookPayload = S.encodeSync(S.parseJson(ToolInputRecord))

/**
 * The slice of the harness these operations actually depend on. Narrowing here
 * keeps the executor off the full `ExtensionContext` union surface and lets a
 * caller — production or test — supply exactly what is used, with no cast.
 */
export interface HookSession {
  readonly cwd: string
  readonly sessionManager: { readonly getSessionId: () => string }
  readonly ui: { readonly notify: (message: string, type?: 'info' | 'warning' | 'error') => void }
}

export interface HookToolCall {
  readonly toolName: string
  readonly toolCallId: string
  /** The harness types this per tool, so it is decoded rather than asserted. */
  readonly input: object
}

export interface HookToolResult extends HookToolCall {
  readonly content: unknown
  readonly isError?: boolean | undefined
}

export interface HookPrompt {
  readonly text: string
  readonly source: InputEvent['source']
  readonly images?: InputEvent['images']
}

/**
 * Nothing awaits a forked hook, so an unhandled failure here reaches no one:
 * a mistyped exec-form command would fail to spawn in total silence.
 */
const superviseFork = <E, R>(
  hook: Effect.Effect<HookResult, E, R>,
  ctx: HookSession,
  command: string,
): Effect.Effect<void, never, R> =>
  hook.pipe(
    Effect.matchCause({
      onSuccess: (result) => recordAsyncHookOutput(result.stdout),
      onFailure: (cause) => {
        if (Cause.isInterruptedOnly(cause)) return
        ctx.ui.notify(`Background hook failed: ${command}: ${Cause.pretty(cause).split('\n')[0]}`, 'error')
      },
    }),
  )

interface HooksForEventResult {
  readonly block?: boolean
  readonly reason?: string
  readonly warning?: string
  readonly updatedInput?: Record<string, unknown>
}

export const runHooksForEvent = Effect.fn('runHooksForEvent')(function*(
  entries: readonly HookEntry[],
  matchValue: string,
  input: Record<string, unknown>,
  ctx: HookSession,
  event: string,
) {
  const cwd = ctx.cwd
  const ruleInput = Option.getOrElse(asToolInput(input['tool_input']), () => EMPTY_TOOL_INPUT)
  let warning: string | undefined
  let currentInput = input
  // A matcher this event cannot evaluate must not behave as a match. U3 already
  // named the hook at session start, so this is a silent skip, not a report.
  const matcherUnreadable = UNREADABLE_MATCHER[event] !== undefined

  for (const entry of entries) {
    if (matcherUnreadable && entry.matcher !== undefined) continue
    if (!matchesMatcher(matchValue, entry.matcher)) continue

    for (const hook of entry.hooks) {
      if (hook.type !== 'command') continue
      if (hook.if !== undefined) {
        // `if` is a permission rule over a tool call, so only a tool event can
        // satisfy one. Elsewhere a hook that sets `if` never runs.
        if (!IF_EVALUATING_EVENTS.includes(event)) continue
        if (!matchesPermissionRule(hook.if, matchValue, ruleInput, cwd)) continue
      }
      if (hook.async === true || hook.asyncRewake === true) {
        yield* Effect.forkDaemon(
          superviseFork(runHookScript(hook, currentInput, cwd, event), ctx, hook.command),
        )
        continue
      }

      const result = yield* runHookScript(hook, currentInput, cwd, event)

      const verdict = interpretHookResult(result, event)
      const decision = Either.match(verdict, {
        onLeft: (err) =>
          Match.value(err).pipe(
            Match.tag('HookVerdictError', (e) =>
              new Warning({ message: `Hook exited 0 but produced invalid JSON: ${e.raw.slice(0, 200)}` })),
            Match.exhaustive,
          ),
        onRight: (d) => d,
      })

      const outcome: HookOutcome = Match.value(decision).pipe(
        Match.tag('Block', (d) => new Blocked({ reason: d.reason })),
        Match.tag('Warning', (d) => new Continue({ warning: d.message })),
        Match.tag('Allow', (d) => new Continue({ updatedInput: d.updatedInput })),
        Match.exhaustive,
      )

      // Sequence the loop from the outcome; arms perform the effects.
      const hookExit: Option.Option<HooksForEventResult> = Match.value(outcome).pipe(
        Match.tag('Blocked', (b) => Option.some({ block: true as const, reason: b.reason })),
        Match.tag('Continue', (c) => {
          if (c.warning !== undefined && warning === undefined) warning = c.warning
          if (c.updatedInput !== undefined) {
            currentInput = { ...currentInput, ...c.updatedInput }
          }
          return Option.none()
        }),
        Match.exhaustive,
      )

      if (Option.isSome(hookExit)) return hookExit.value
    }
  }

  return {
    ...(currentInput === input ? {} : { updatedInput: currentInput }),
    ...(warning !== undefined ? { warning } : {}),
  } satisfies HooksForEventResult
})

// ── Event runners ──

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
  let lastResult: HooksForEventResult = {}
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
    if (result.block === true) return result
    if (firstWarning === undefined) firstWarning = result.warning
    lastResult = result
  }

  return firstWarning === undefined ? lastResult : { ...lastResult, warning: firstWarning }
})

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
  // Claude Code documents this event as non-blocking: the tool already failed,
  // so an exit-2 verdict reaches the model as feedback rather than a block.
  const degraded: HooksForEventResult = result.block !== true
    ? result
    : result.reason === undefined
    ? {}
    : { warning: result.reason }
  return degraded
})

export const runToolResultHooks = Effect.fn('runToolResultHooks')(function*(
  settings: HookSettings,
  event: HookToolResult,
  ctx: HookSession,
) {
  return event.isError === true
    ? yield* runPostToolUseFailureHooks(settings, event, ctx)
    : yield* runPostToolUseHooks(settings, event, ctx)
})

/**
 * The matcher this event documents is `trigger` (manual vs auto), which OMP's
 * payload does not carry — U4's gate skips any hook that declares one, so only
 * unscoped hooks reach here and `matchValue` is never consulted.
 */
export const runPreCompactHooks = Effect.fn('runPreCompactHooks')(function*(
  settings: HookSettings,
  ctx: HookSession,
) {
  const input: Record<string, unknown> = {
    ...sessionIds(() => ctx.sessionManager.getSessionId()),
  }

  return yield* runHooksForEvent(settings.hooks.PreCompact, '', input, ctx, 'PreCompact')
})

export const runUserPromptSubmitHooks = Effect.fn('runUserPromptSubmitHooks')(function*(
  settings: HookSettings,
  event: HookPrompt,
  ctx: HookSession,
) {
  const entries = settings.hooks.UserPromptSubmit
  const cwd = ctx.cwd
  let injected = drainAsyncHookOutput().join('\n\n')
  const input: Record<string, unknown> = {
    ...sessionIds(() => ctx.sessionManager.getSessionId()),
    prompt: event.text,
    source: event.source,
  }

  for (const entry of entries) {
    for (const hook of entry.hooks) {
      if (hook.type !== 'command') continue
      if (hook.if !== undefined) continue
      const result = yield* runHookScript(hook, input, cwd, 'UserPromptSubmit')

      // Claude Code rejects the prompt on exit 2 or `decision: "block"`, feeding
      // the reason back rather than injecting stdout as context.
      const blockReason = Either.match(interpretHookResult(result, 'UserPromptSubmit'), {
        onLeft: () => undefined,
        onRight: (decision) =>
          Match.value(decision).pipe(
            Match.tag('Block', (b) => b.reason),
            Match.orElse(() => undefined),
          ),
      })
      if (blockReason !== undefined) {
        ctx.ui.notify(`Prompt blocked by UserPromptSubmit hook: ${blockReason}`, 'error')
        return { handled: true } satisfies InputEventResult
      }

      if (result.code !== 0) continue

      const stdout = result.stdout.trim()
      if (stdout.length > 0) {
        injected += (injected.length > 0 ? '\n\n' : '') + stdout
      }
    }
  }

  if (injected.length === 0) return undefined

  const result: InputEventResult = {
    text: `${injected}\n\n${event.text}`,
  }
  if (event.images !== undefined) {
    result.images = event.images
  }
  return result
})

export const runSessionStartHooks = Effect.fn('runSessionStartHooks')(function*(
  settings: HookSettings,
  reason: string,
  ctx: HookSession,
) {
  const entries = settings.hooks.SessionStart
  if (entries.length === 0) return

  const cwd = ctx.cwd
  const input: Record<string, unknown> = {
    ...sessionIds(() => ctx.sessionManager.getSessionId()),
    reason,
  }

  for (const entry of entries) {
    if (entry.matcher !== undefined && !matchesMatcher(reason, entry.matcher)) continue

    for (const hook of entry.hooks) {
      if (hook.type !== 'command') continue
      if (hook.if !== undefined) continue
      if (hook.async === true || hook.asyncRewake === true) {
        yield* Effect.forkDaemon(
          superviseFork(runHookScript(hook, input, cwd, 'SessionStart'), ctx, hook.command),
        )
        continue
      }

      yield* runHookScript(hook, input, cwd, 'SessionStart')
    }
  }
})

/**
 * Of the four reasons `session_switch` carries, only `resume` and `fork` name a
 * `SessionStart` matcher Claude Code documents. `new` and `handoff` are not
 * session-start moments, so nothing runs for them.
 */
export const runSessionSwitchHooks = Effect.fn('runSessionSwitchHooks')(function*(
  settings: HookSettings,
  reason: string,
  ctx: HookSession,
) {
  if (reason !== 'resume' && reason !== 'fork') return
  yield* runSessionStartHooks(settings, reason, ctx)
})

export const runLifecycleHooks = Effect.fn('runLifecycleHooks')(function*(
  entries: readonly HookEntry[],
  ctx: HookSession,
  event: string,
) {
  if (entries.length === 0) return

  const cwd = ctx.cwd

  const input: Record<string, unknown> = {
    ...sessionIds(() => ctx.sessionManager.getSessionId()),
  }

  // The matcher axis is the same refusal `runHooksForEvent` makes: an event
  // whose matcher this bridge cannot read must not run a matcher'd hook as
  // though the matcher had matched.
  const matcherUnreadable = UNREADABLE_MATCHER[event] !== undefined

  for (const entry of entries) {
    if (matcherUnreadable && entry.matcher !== undefined) continue
    for (const hook of entry.hooks) {
      if (hook.type !== 'command') continue
      if (hook.if !== undefined) continue
      if (hook.async === true || hook.asyncRewake === true) {
        yield* Effect.forkDaemon(
          superviseFork(runHookScript(hook, input, cwd, event), ctx, hook.command),
        )
      } else {
        yield* runHookScript(hook, input, cwd, event)
      }
    }
  }
})
