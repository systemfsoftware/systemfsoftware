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
import type { TelemetryEmitter } from '@systemfsoftware/omp-utils'
import { Context, Effect, Either, Match, Option, Stream } from 'effect'
import { resolve } from 'node:path'
import { Blocked, Continue, Warning } from './hook-dispatcher.schema.js'
import type { HookOutcome, HookResult } from './hook-dispatcher.schema.js'
import { parseHookOutput } from './hook-output.acl.js'
import { parseSettings } from './hook-settings.acl.js'
import type { HookEntry, HookSettings } from './hook-settings.acl.js'
import { interpretHookResult } from './hook-verdict.workflow.js'

export class HookDispatcherExecutorDeps extends Context.Tag('HookDispatcherExecutorDeps')<
  HookDispatcherExecutorDeps,
  { readonly tel: TelemetryEmitter }
>() {}

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

  const pathPart = unquoted.split(/\s+/)[0] ?? ''
  if (pathPart.endsWith('.ts')) {
    return { cmd: 'bun', args: [resolve(cwd, pathPart)] }
  }

  return { cmd: 'sh', args: ['-c', unquoted] }
}

function hookNameFromCommand(command: string): string {
  return command.split(/[\\/]/).pop() ?? command
}

export const loadSettings = Effect.fn('loadSettings')(function*(cwd: string) {
  const fs = yield* FileSystem
  const settingsPath = `${cwd}/.claude/settings.json`
  const content = yield* fs.readFileString(settingsPath).pipe(Effect.catchAll(() => Effect.succeed('')))

  if (content === '') return null

  const json = yield* Effect.try({
    try: () => JSON.parse(content) as unknown,
    catch: () => null,
  })
  if (json === null) return null

  const either = parseSettings(json)
  return Either.isLeft(either) ? null : either.right
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
  const { tel } = yield* HookDispatcherExecutorDeps
  let warning: string | undefined
  let inputModified = false
  let currentInput = input

  for (const entry of entries) {
    if (!matchesMatcher(matchValue, entry.matcher)) continue

    for (const hook of entry.hooks) {
      const hookName = hookNameFromCommand(hook.command)
      const hookStart = performance.now()
      const timeoutMs = (hook.timeout ?? 10) * 1000

      if (hook.async) {
        yield* Effect.forkDaemon(
          runHookScript(hook.command, currentInput, cwd, timeoutMs).pipe(
            Effect.tap((result) =>
              Effect.sync(() => {
                const durationMs = Math.round(performance.now() - hookStart)
                tel('hook.executed', { hook: hookName, duration_ms: durationMs, exit_code: result.code })
              })
            ),
            Effect.catchAll(() =>
              Effect.sync(() => {
                const durationMs = Math.round(performance.now() - hookStart)
                tel('hook.executed', { hook: hookName, duration_ms: durationMs, exit_code: null })
              })
            ),
          ),
        )
        continue
      }

      const result = yield* runHookScript(hook.command, currentInput, cwd, timeoutMs).pipe(
        Effect.tap((r) =>
          Effect.sync(() => {
            const durationMs = Math.round(performance.now() - hookStart)
            tel('hook.executed', { hook: hookName, duration_ms: durationMs, exit_code: r.code })
          })
        ),
        Effect.tapError(() =>
          Effect.sync(() => {
            const durationMs = Math.round(performance.now() - hookStart)
            tel('hook.executed', { hook: hookName, duration_ms: durationMs, exit_code: null })
          })
        ),
      )

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
  const { tel } = yield* HookDispatcherExecutorDeps
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
      tel('tool_call.decision', {
        tool_name: claudeToolName,
        decision: 'block',
        reason: bashResult.reason ?? `Bash blocked for ${shellCommand}`,
      })
      return bashResult.reason === undefined
        ? { block: true }
        : { block: true, reason: bashResult.reason }
    }
  }

  const result = yield* runHooksForEvent(settings.hooks.PreToolUse, claudeToolName, input, ctx, 'PreToolUse')

  if (result.block) {
    tel('tool_call.decision', {
      tool_name: claudeToolName,
      decision: 'block',
      reason: result.reason ?? undefined,
    })
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

  tel('tool_call.decision', {
    tool_name: claudeToolName,
    decision: 'allow',
  })
  return undefined
})

export const runPostToolUseHooks = Effect.fn('runPostToolUseHooks')(function*(
  settings: HookSettings,
  event: ToolResultEvent,
  ctx: ExtensionContext,
) {
  const claudeToolName = normalizeToolName(event.toolName)
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
  const { tel } = yield* HookDispatcherExecutorDeps
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
      const hookName = hookNameFromCommand(hook.command)
      const timeoutMs = (hook.timeout ?? 10) * 1000

      if (hook.async) {
        yield* Effect.forkDaemon(
          runHookScript(hook.command, input, cwd, timeoutMs).pipe(
            Effect.tap((result) =>
              Effect.sync(() => {
                tel('hook.executed', { hook: hookName, exit_code: result.code })
              })
            ),
            Effect.catchAll(() =>
              Effect.sync(() => {
                tel('hook.executed', { hook: hookName, exit_code: null })
              })
            ),
          ),
        )
        continue
      }

      yield* runHookScript(hook.command, input, cwd, timeoutMs).pipe(
        Effect.tap((result) =>
          Effect.sync(() => {
            tel('hook.executed', { hook: hookName, exit_code: result.code })
          })
        ),
        Effect.catchAll(() =>
          Effect.sync(() => {
            tel('hook.executed', { hook: hookName, exit_code: null })
          })
        ),
      )
    }
  }
})

export const runLifecycleHooks = Effect.fn('runLifecycleHooks')(function*(
  entries: readonly HookEntry[],
  ctx: ExtensionContext,
) {
  if (entries.length === 0) return

  const { tel } = yield* HookDispatcherExecutorDeps

  const cwd = ctx.cwd

  const input: Record<string, unknown> = {
    ...sessionIds(() => ctx.sessionManager.getSessionId()),
  }

  for (const entry of entries) {
    for (const hook of entry.hooks) {
      const hookName = hookNameFromCommand(hook.command)
      const timeoutMs = (hook.timeout ?? 10) * 1000

      if (hook.async) {
        yield* Effect.forkDaemon(
          runHookScript(hook.command, input, cwd, timeoutMs).pipe(
            Effect.tap((result) =>
              Effect.sync(() => {
                tel('hook.executed', { hook: hookName, exit_code: result.code })
              })
            ),
            Effect.catchAll(() =>
              Effect.sync(() => {
                tel('hook.executed', { hook: hookName, exit_code: null })
              })
            ),
          ),
        )
      } else {
        yield* runHookScript(hook.command, input, cwd, timeoutMs).pipe(
          Effect.tap((result) =>
            Effect.sync(() => {
              tel('hook.executed', { hook: hookName, exit_code: result.code })
            })
          ),
          Effect.catchAll(() =>
            Effect.sync(() => {
              tel('hook.executed', { hook: hookName, exit_code: null })
            })
          ),
        )
      }
    }
  }
})
