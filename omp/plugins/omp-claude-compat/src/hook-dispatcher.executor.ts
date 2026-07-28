import { Command } from '@effect/platform'
import { CommandExecutor } from '@effect/platform/CommandExecutor'
import { FileSystem } from '@effect/platform/FileSystem'
import type {
  ExtensionContext,
  InputEvent,
  InputEventResult,
  ToolCallEvent,
  ToolResultEvent,
} from '@oh-my-pi/pi-coding-agent'
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
import { Effect, Either, Match, Option, Schema as S, Stream } from 'effect'
import { homedir } from 'node:os'
import { Blocked, Continue, Warning } from './hook-dispatcher.schema.js'
import type { HookOutcome, HookResult } from './hook-dispatcher.schema.js'
import { mergeSettings, parseSettings, unknownHookEvents, unsupportedHookTypes } from './hook-settings.acl.js'
import type { CommandHook, HookEntry, HookSettings, SettingsSource } from './hook-settings.acl.js'
import { interpretHookResult } from './hook-verdict.workflow.js'

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

export const collectSettingsGapsWithPaths = Effect.fn('collectSettingsGapsWithPaths')(function*(
  paths: readonly string[],
) {
  const fs = yield* FileSystem
  const events: string[] = []
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
    events.push(...unknownHookEvents(parsed.right))
    hookTypes.push(...unsupportedHookTypes(parsed.right))
    // The loader skips a file it cannot decode, contributing no hooks at all.
    // Name it rather than starting the session unguarded with no sign of it.
    if (Either.isLeft(parseSettings(parsed.right))) malformed.push(path)
  }
  return {
    unknownEvents: Array.from(new Set(events)),
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
  const stdinText = JSON.stringify(input)

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

const asToolInput = S.decodeUnknownOption(S.Record({ key: S.String, value: S.Unknown }))

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
  ctx: ExtensionContext,
  event: string,
) {
  const cwd = ctx.cwd
  const ruleInput = Option.getOrElse(asToolInput(input['tool_input']), () => EMPTY_TOOL_INPUT)
  let warning: string | undefined
  let inputModified = false
  let currentInput = input

  for (const entry of entries) {
    if (!matchesMatcher(matchValue, entry.matcher)) continue

    for (const hook of entry.hooks) {
      if (hook.type !== 'command') continue
      if (hook.if !== undefined && !matchesPermissionRule(hook.if, matchValue, ruleInput, cwd)) continue
      if (hook.async || hook.asyncRewake) {
        yield* Effect.forkDaemon(
          runHookScript(hook, currentInput, cwd, event),
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
            inputModified = true
          }
          return Option.none()
        }),
        Match.exhaustive,
      )

      if (Option.isSome(hookExit)) return hookExit.value
    }
  }

  return {
    ...(inputModified ? { updatedInput: currentInput } : {}),
    ...(warning !== undefined ? { warning } : {}),
  } satisfies HooksForEventResult
})

// ── Event runners ──

export const runPreToolUseHooks = Effect.fn('runPreToolUseHooks')(function*(
  settings: HookSettings,
  event: ToolCallEvent,
  ctx: ExtensionContext,
) {
  const claudeToolName = normalizeToolName(event.toolName)
  const sessionData = sessionIds(() => ctx.sessionManager.getSessionId())
  const rawInput = event.input as Record<string, unknown>
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
    if (bashResult.block) {
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

    if (result.block) {
      return result.reason === undefined
        ? { block: true }
        : { block: true, reason: result.reason }
    }
    lastResult = result
  }

  // Only a single-target call has an unambiguous rewrite target, and the delta
  // must go back under the key names OMP reads — the forward pass renamed them.
  const updated = payloads.length === 1 ? lastResult.updatedInput?.['tool_input'] : undefined
  for (const [key, value] of Object.entries(denormalizeToolInput(rawInput, updated))) {
    rawInput[key] = value
  }

  return undefined
})

export const runPostToolUseHooks = Effect.fn('runPostToolUseHooks')(function*(
  settings: HookSettings,
  event: ToolResultEvent,
  ctx: ExtensionContext,
) {
  const claudeToolName = normalizeToolName(event.toolName)
  const sessionData = sessionIds(() => ctx.sessionManager.getSessionId())
  const toolInput = normalizeToolInput(claudeToolName, event.input)
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
    if (result.block) return result
    if (firstWarning === undefined) firstWarning = result.warning
    lastResult = result
  }

  return firstWarning === undefined ? lastResult : { ...lastResult, warning: firstWarning }
})

export const runUserPromptSubmitHooks = Effect.fn('runUserPromptSubmitHooks')(function*(
  settings: HookSettings,
  event: InputEvent,
  ctx: ExtensionContext,
) {
  const entries = settings.hooks.UserPromptSubmit
  if (entries.length === 0) return undefined

  const cwd = ctx.cwd
  let injected = ''
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
  ctx: ExtensionContext,
) {
  const entries = settings.hooks.SessionStart
  if (entries.length === 0) return

  const cwd = ctx.cwd
  const input: Record<string, unknown> = {
    ...sessionIds(() => ctx.sessionManager.getSessionId()),
    reason,
  }

  for (const entry of entries) {
    if (entry.matcher && !matchesMatcher(reason, entry.matcher)) continue

    for (const hook of entry.hooks) {
      if (hook.type !== 'command') continue
      if (hook.if !== undefined) continue
      if (hook.async || hook.asyncRewake) {
        yield* Effect.forkDaemon(
          runHookScript(hook, input, cwd, 'SessionStart'),
        )
        continue
      }

      yield* runHookScript(hook, input, cwd, 'SessionStart')
    }
  }
})

export const runLifecycleHooks = Effect.fn('runLifecycleHooks')(function*(
  entries: readonly HookEntry[],
  ctx: ExtensionContext,
  event: string,
) {
  if (entries.length === 0) return

  const cwd = ctx.cwd

  const input: Record<string, unknown> = {
    ...sessionIds(() => ctx.sessionManager.getSessionId()),
  }

  for (const entry of entries) {
    for (const hook of entry.hooks) {
      if (hook.type !== 'command') continue
      if (hook.if !== undefined) continue
      if (hook.async || hook.asyncRewake) {
        yield* Effect.forkDaemon(
          runHookScript(hook, input, cwd, event),
        )
      } else {
        yield* runHookScript(hook, input, cwd, event)
      }
    }
  }
})
