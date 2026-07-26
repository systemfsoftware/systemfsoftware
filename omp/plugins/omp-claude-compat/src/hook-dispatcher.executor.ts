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
  extractShellCommand,
  matchesMatcher,
  normalizeToolInput,
  normalizeToolName,
  sessionIds,
} from '@systemfsoftware/omp-utils'
import { Effect, Either, Match, Option, Schema as S, Stream } from 'effect'
import { homedir } from 'node:os'
import { Blocked, Continue, Warning } from './hook-dispatcher.schema.js'
import type { HookOutcome, HookResult } from './hook-dispatcher.schema.js'

import { parseHookOutput } from './hook-output.acl.js'
import { isHooksDisabled, mergeSettings, parseSettings } from './hook-settings.acl.js'
import type { HookEntry, HookSettings } from './hook-settings.acl.js'
import { interpretHookResult } from './hook-verdict.workflow.js'

interface ResolvedCommand {
  readonly cmd: string
  readonly args: readonly string[]
}

function resolveCommandPath(command: string, cwd: string): ResolvedCommand {
  const expanded = command
    .replace(/"\$OMP_PROJECT_DIR"|'\$OMP_PROJECT_DIR'/g, JSON.stringify(cwd))
    .replace(/"\$\{OMP_PROJECT_DIR\}"|'\$\{OMP_PROJECT_DIR\}'/g, JSON.stringify(cwd))
    .replace(/"\$CLAUDE_PROJECT_DIR"|'\$CLAUDE_PROJECT_DIR'/g, JSON.stringify(cwd))
    .replace(/"\$\{CLAUDE_PROJECT_DIR\}"|'\$\{CLAUDE_PROJECT_DIR\}'/g, JSON.stringify(cwd))
    .replace(/\$OMP_PROJECT_DIR|\$\{OMP_PROJECT_DIR\}/g, JSON.stringify(cwd))
    .replace(/\$CLAUDE_PROJECT_DIR|\$\{CLAUDE_PROJECT_DIR\}/g, JSON.stringify(cwd))
  const trimmed = expanded.trim()
  const unquoted = trimmed.startsWith('"') && trimmed.endsWith('"') ? trimmed.slice(1, -1) : trimmed
  return { cmd: 'sh', args: ['-c', unquoted] }
}

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

export const loadSettings = Effect.fn('loadSettings')(function*(cwd: string) {
  const paths = [
    `${homedir()}/.claude/settings.json`,
    `${cwd}/.claude/settings.json`,
    `${cwd}/.claude/settings.local.json`,
    '/etc/claude-code/managed-settings.json',
  ] as const
  return yield* loadSettingsWithPaths(paths)
})

export const loadSettingsWithPaths = Effect.fn('loadSettingsWithPaths')(function*(
  paths: readonly string[],
) {
  const results: HookSettings[] = []
  for (const p of paths) {
    const s = yield* loadSettingsFile(p)
    if (s !== null) results.push(s)
  }
  if (results.length === 0) return null
  return mergeSettings(results)
})

export const runHookScript = Effect.fn('runHookScript')(function*(
  command: string,
  input: Record<string, unknown>,
  cwd: string,
  timeoutMs: number,
) {
  const executor = yield* CommandExecutor
  const { cmd, args } = resolveCommandPath(command, cwd)
  const stdinText = JSON.stringify(input)

  const hookCommand = Command.make(cmd, ...args).pipe(
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
  let warning: string | undefined
  let inputModified = false
  let currentInput = input

  for (const entry of entries) {
    if (!matchesMatcher(matchValue, entry.matcher)) continue

    for (const hook of entry.hooks) {
      const timeoutMs = (hook.timeout ?? 10) * 1000

      if (hook.async) {
        yield* Effect.forkDaemon(
          runHookScript(hook.command, currentInput, cwd, timeoutMs),
        )
        continue
      }

      const result = yield* runHookScript(hook.command, currentInput, cwd, timeoutMs)

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
        Match.tag('Allow', () => {
          const either = parseHookOutput(result.stdout)
          const updatedInput = Either.isRight(either) ? either.right.hookSpecificOutput?.updatedInput : undefined
          return new Continue({ updatedInput })
        }),
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
  if (isHooksDisabled(settings)) return undefined
  const claudeToolName = normalizeToolName(event.toolName)
  const sessionData = sessionIds(() => ctx.sessionManager.getSessionId())
  const input: Record<string, unknown> = {
    ...sessionData,
    tool_name: claudeToolName,
    tool_input: normalizeToolInput(claudeToolName, event.input as Record<string, unknown>),
    tool_call_id: event.toolCallId,
  }

  const shellCommand = extractShellCommand(event.toolName, event.input as Record<string, unknown>)
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

  const result = yield* runHooksForEvent(settings.hooks.PreToolUse, claudeToolName, input, ctx, 'PreToolUse')

  if (result.block) {
    return result.reason === undefined
      ? { block: true }
      : { block: true, reason: result.reason }
  }

  // OMP's tool_call event only supports blocking; it cannot rewrite the tool input.
  if (
    result.updatedInput &&
    typeof result.updatedInput === 'object' &&
    'tool_input' in result.updatedInput &&
    result.updatedInput['tool_input'] &&
    typeof result.updatedInput['tool_input'] === 'object'
  ) {
    const updated = result.updatedInput['tool_input']
    for (const [key, value] of Object.entries(updated)) {
      ;(event.input as Record<string, unknown>)[key] = value
    }
  }

  return undefined
})

export const runPostToolUseHooks = Effect.fn('runPostToolUseHooks')(function*(
  settings: HookSettings,
  event: ToolResultEvent,
  ctx: ExtensionContext,
) {
  const claudeToolName = normalizeToolName(event.toolName)
  if (isHooksDisabled(settings)) return undefined
  const input: Record<string, unknown> = {
    ...sessionIds(() => ctx.sessionManager.getSessionId()),
    tool_name: claudeToolName,
    tool_input: normalizeToolInput(claudeToolName, event.input),
    tool_call_id: event.toolCallId,
    output: event.content,
    is_error: event.isError ?? false,
  }

  return yield* runHooksForEvent(settings.hooks.PostToolUse, claudeToolName, input, ctx, 'PostToolUse')
})

export const runUserPromptSubmitHooks = Effect.fn('runUserPromptSubmitHooks')(function*(
  settings: HookSettings,
  event: InputEvent,
  ctx: ExtensionContext,
) {
  const entries = settings.hooks.UserPromptSubmit
  if (isHooksDisabled(settings)) return undefined
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
      const result = yield* runHookScript(hook.command, input, cwd, (hook.timeout ?? 10) * 1000)
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
  if (isHooksDisabled(settings)) return
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
      const timeoutMs = (hook.timeout ?? 10) * 1000

      if (hook.async) {
        yield* Effect.forkDaemon(
          runHookScript(hook.command, input, cwd, timeoutMs),
        )
        continue
      }

      yield* runHookScript(hook.command, input, cwd, timeoutMs)
    }
  }
})

export const runLifecycleHooks = Effect.fn('runLifecycleHooks')(function*(
  entries: readonly HookEntry[],
  ctx: ExtensionContext,
) {
  if (entries.length === 0) return

  const cwd = ctx.cwd

  const input: Record<string, unknown> = {
    ...sessionIds(() => ctx.sessionManager.getSessionId()),
  }

  for (const entry of entries) {
    for (const hook of entry.hooks) {
      const timeoutMs = (hook.timeout ?? 10) * 1000

      if (hook.async) {
        yield* Effect.forkDaemon(
          runHookScript(hook.command, input, cwd, timeoutMs),
        )
      } else {
        yield* runHookScript(hook.command, input, cwd, timeoutMs)
      }
    }
  }
})
