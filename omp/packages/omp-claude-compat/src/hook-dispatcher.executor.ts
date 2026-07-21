/**
 * I/O sandwich shell for the OMP hook dispatcher bridge.
 *
 * Owns the read → decide → write sequence. Every operation here is impure:
 * subprocess execution via CommandExecutor, file reading via FileSystem,
 * telemetry emission. Pure decisions live in hook-dispatcher.workflow.ts.
 */
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
import { Effect, Stream } from 'effect'
import {
  hookNameFromCommand,
  interpretHookResult,
  isBlockDecision,
  isWarningDecision,
  parseHookOutput,
  parseSettings,
  resolveCommandPath,
} from './hook-dispatcher.workflow.js'
import type { HookEntry, HookResult, HookSettings } from './hook-dispatcher.workflow.js'

/** Module-scoped telemetry emitter, initialized in the default export. */
let tel: TelemetryEmitter = () => {}

export function setTelemetryEmitter(emitter: TelemetryEmitter): void {
  tel = emitter
}

// ── Settings loading (read step) ──

const settingsCache = new Map<string, HookSettings | null>()

export function clearSettingsCache(): void {
  settingsCache.clear()
}

export const loadSettings = Effect.fn('loadSettings')(function*(cwd: string) {
  const cached = settingsCache.get(cwd)
  if (cached !== undefined) return cached

  const fs = yield* FileSystem
  const settingsPath = `${cwd}/.claude/settings.json`
  const content = yield* fs.readFileString(settingsPath).pipe(Effect.catchAll(() => Effect.succeed('')))

  if (content === '') return null

  try {
    const parsed = parseSettings(JSON.parse(content))
    settingsCache.set(cwd, parsed)
    return parsed
  } catch {
    return null
  }
})

// ── Hook execution (impure subprocess) ──

/**
 * Run a hook script as a subprocess via @effect/platform CommandExecutor.
 * The subprocess is a lazy Effect value, not an eager child_process.
 */
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

      const decision = interpretHookResult(result, event)

      if (isBlockDecision(decision)) {
        return { block: true, reason: decision.reason } satisfies HooksForEventResult
      }

      if (isWarningDecision(decision)) {
        if (warning === undefined) warning = decision.message
        continue
      }

      // Allow: check for updatedInput in parsed output
      const parsed = parseHookOutput(result.stdout)
      const updatedInput = parsed?.hookSpecificOutput?.updatedInput
      if (updatedInput) {
        currentInput = { ...currentInput, ...updatedInput }
        inputModified = true
      }
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
