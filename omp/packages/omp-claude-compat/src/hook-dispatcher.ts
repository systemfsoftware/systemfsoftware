/**
 * OMP Hook Dispatcher
 *
 * Bridges the project harness to Oh My Pi's ExtensionAPI. Reads the CANONICAL
 * `.claude/settings.json` directly (the single source of truth for which hooks
 * run) and executes each configured `.claude/hooks/*.ts` script as a subprocess
 * with the stdin/stdout contract the scripts already expect.
 *
 * There is deliberately NO `.omp/settings.json`: a second manifest would be a
 * parallel source of truth and the root cause of drift. The bridge owns only the
 * TRANSFORMS (tool-name / matcher / input normalization, block-contract mapping,
 * and skipping events/hooks OMP cannot support), never a copy of the hook list.
 */
import type {
  ExtensionAPI,
  ExtensionContext,
  InputEvent,
  InputEventResult,
  ToolCallEvent,
  ToolResultEvent,
} from '@oh-my-pi/pi-coding-agent'
import {
  createTelemetry,
  extractShellCommand,
  matchesMatcher,
  normalizeToolInput,
  normalizeToolName,
  sessionIds,
} from '@systemfsoftware/omp-utils'
import type { TelemetryEmitter } from '@systemfsoftware/omp-utils'
import { execFile } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { extname, resolve } from 'node:path'

interface HookCommand {
  readonly type: 'command'
  readonly command: string
  readonly async?: boolean
  readonly timeout?: number
}

interface HookEntry {
  readonly matcher?: string
  readonly hooks: readonly HookCommand[]
}

interface HookSettings {
  readonly hooks: {
    readonly Stop: readonly HookEntry[]
    readonly SessionStart: readonly HookEntry[]
    readonly SessionEnd: readonly HookEntry[]
    readonly UserPromptSubmit: readonly HookEntry[]
    readonly PreToolUse: readonly HookEntry[]
    readonly PostToolUse: readonly HookEntry[]
  }
}

interface HookResult {
  readonly code: number
  readonly stdout: string
  readonly stderr: string
}

const EVENT_NAMES = ['Stop', 'SessionStart', 'SessionEnd', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse'] as const

type HookEventName = (typeof EVENT_NAMES)[number]

function getSessionIds(ctx: ExtensionContext): { readonly session_id: string; readonly agent_id: null } {
  return sessionIds(() => ctx.sessionManager.getSessionId())
}

/** Module-scoped telemetry emitter, initialized in the default export. */
let tel: TelemetryEmitter = () => {}

export default function hookDispatcherExtension(pi: ExtensionAPI): void {
  tel = createTelemetry('claude_compat', pi.logger)

  pi.on('tool_call', async (event: ToolCallEvent, ctx: ExtensionContext) => {
    const settings = loadSettings(ctx.cwd)
    if (!settings) return undefined
    return runPreToolUseHooks(settings, event, ctx)
  })

  pi.on('tool_result', async (event: ToolResultEvent, ctx: ExtensionContext) => {
    const settings = loadSettings(ctx.cwd)
    if (!settings) return undefined
    const result = await runPostToolUseHooks(settings, event, ctx)
    if (result?.block) {
      return {
        isError: true,
        content: [{ type: 'text', text: result.reason ?? `Blocked by PostToolUse hook` }],
      }
    }
    // Warning (hook exited non-2 non-zero): the tool already succeeded, so we
    // surface the message as context without marking the result as an error.
    if (result?.warning) {
      return {
        content: [...(event.content ?? []), { type: 'text' as const, text: result.warning }],
        isError: event.isError,
      }
    }
    return undefined
  })

  pi.on('input', async (event: InputEvent, ctx: ExtensionContext) => {
    const settings = loadSettings(ctx.cwd)
    if (!settings) return undefined
    return runUserPromptSubmitHooks(settings, event, ctx)
  })

  // SessionStart fires on initial load, after compaction, and when the agent
  // loop starts after resume. The configured matcher "compact|clear|resume"
  // is sent as the `reason` field so scripts can filter if they choose.
  pi.on('session_start', async (_event: { type: string }, ctx: ExtensionContext) => {
    const settings = loadSettings(ctx.cwd)
    if (!settings) return undefined
    await runSessionStartHooks(settings, 'start', ctx)
    return undefined
  })

  pi.on('session_compact', async (_event: { type: string }, ctx: ExtensionContext) => {
    const settings = loadSettings(ctx.cwd)
    if (!settings) return undefined
    await runSessionStartHooks(settings, 'compact', ctx)
    return undefined
  })

  pi.on('agent_start', async (_event: { type: string }, ctx: ExtensionContext) => {
    const settings = loadSettings(ctx.cwd)
    if (!settings) return undefined
    await runSessionStartHooks(settings, 'resume', ctx)
    return undefined
  })

  pi.on('session_shutdown', async (_event: { type: string }, ctx: ExtensionContext) => {
    const settings = loadSettings(ctx.cwd)
    if (!settings) return undefined
    await runLifecycleHooks(settings.hooks.SessionEnd, ctx)
    return undefined
  })

  pi.on('session_stop', async (_event: { type: string }, ctx: ExtensionContext) => {
    const settings = loadSettings(ctx.cwd)
    if (!settings) return undefined
    await runLifecycleHooks(settings.hooks.Stop, ctx)
    return undefined
  })
}

// Settings do not change during a session; re-reading per event is pure overhead.
const settingsCache = new Map<string, HookSettings | null>()

function loadSettings(cwd: string): HookSettings | null {
  const cached = settingsCache.get(cwd)
  if (cached !== undefined) return cached
  const settingsPath = resolve(cwd, '.claude', 'settings.json')
  if (!existsSync(settingsPath)) return null
  try {
    const data = JSON.parse(readFileSync(settingsPath, 'utf-8'))
    // Claude Code canon nests under `hooks`; some repos keep the groups top-level.
    const source = (data.hooks ?? data) as Record<string, unknown>
    const group = (key: string): HookEntry[] => (Array.isArray(source[key]) ? (source[key] as HookEntry[]) : [])
    const result: HookSettings = {
      hooks: {
        PreToolUse: group('PreToolUse'),
        PostToolUse: group('PostToolUse'),
        UserPromptSubmit: group('UserPromptSubmit'),
        Stop: group('Stop'),
        SessionStart: group('SessionStart'),
        SessionEnd: group('SessionEnd'),
      },
    }
    settingsCache.set(cwd, result)
    return result
  } catch {
    return null
  }
}

function resolveCommand(
  command: string,
  cwd: string,
): { readonly cmd: string; readonly args: readonly string[] } {
  const expanded = command
    .replace(/"\$OMP_PROJECT_DIR"|'\$OMP_PROJECT_DIR'/g, JSON.stringify(cwd))
    .replace(/"\$\{OMP_PROJECT_DIR\}"|'\$\{OMP_PROJECT_DIR\}'/g, JSON.stringify(cwd))
    .replace(/"\$CLAUDE_PROJECT_DIR"|'\$CLAUDE_PROJECT_DIR'/g, JSON.stringify(cwd))
    .replace(/"\$\{CLAUDE_PROJECT_DIR\}"|'\$\{CLAUDE_PROJECT_DIR\}'/g, JSON.stringify(cwd))
    .replace(/\$OMP_PROJECT_DIR|\$\{OMP_PROJECT_DIR\}/g, JSON.stringify(cwd))
    .replace(/\$CLAUDE_PROJECT_DIR|\$\{CLAUDE_PROJECT_DIR\}/g, JSON.stringify(cwd))
  const trimmed = expanded.trim()
  const unquoted = trimmed.startsWith('"') && trimmed.endsWith('"') ? trimmed.slice(1, -1) : trimmed

  // If the command points to a TypeScript file, run it with bun.
  const pathPart = unquoted.split(/\s+/)[0] ?? ''
  if (extname(pathPart) === '.ts') {
    const scriptPath = resolve(cwd, pathPart)
    return { cmd: 'bun', args: [scriptPath] }
  }

  // Otherwise run through `sh -c` so constructs like `cd ... && ... || ...`
  // continue to work without needing execFile's deprecated `shell: true`.
  return { cmd: 'sh', args: ['-c', unquoted] }
}

async function runHookScript(
  command: string,
  input: Record<string, unknown>,
  cwd: string,
  timeoutMs = 10_000,
): Promise<HookResult> {
  const { cmd, args } = resolveCommand(command, cwd)
  const stdin = JSON.stringify(input)

  const { promise, resolve, reject } = Promise.withResolvers<HookResult>()

  const child = execFile(
    cmd,
    [...args],
    {
      cwd,
      timeout: timeoutMs,
      killSignal: 'SIGKILL',
      env: {
        ...process.env,
        OMP_PROJECT_DIR: cwd,
        CLAUDE_PROJECT_DIR: cwd,
      },
      maxBuffer: 1024 * 1024,
    },
    (error, stdout, stderr) => {
      // execFile passes an Error for ANY non-zero exit. The dispatcher needs
      // the actual exit code to distinguish blocks (2) from warnings (other
      // non-zero). Resolve with whatever numeric code we got; only reject for
      // genuine spawn failures (ENOENT etc.) where no code is available.
      if (error && typeof error.code !== 'number') {
        reject(error)
        return
      }
      resolve({ code: (error?.code as number) ?? 0, stdout, stderr })
    },
  )

  child.stdin?.on('error', () => {}).write(stdin)
  child.stdin?.end()

  return promise
}

async function runHooksForEvent(
  entries: readonly HookEntry[],
  matchValue: string,
  input: Record<string, unknown>,
  ctx: ExtensionContext,
  event: HookEventName,
): Promise<
  {
    readonly block?: boolean
    readonly reason?: string
    readonly warning?: string
    readonly updatedInput?: Record<string, unknown>
  }
> {
  const cwd = ctx.cwd
  let warning: string | undefined
  let inputModified = false
  for (const entry of entries) {
    if (!matchesMatcher(matchValue, entry.matcher)) continue

    for (const hook of entry.hooks) {
      const hookName = hook.command.split(/[\\/]/).pop() ?? hook.command
      const hookStart = performance.now()
      if (hook.async) {
        runHookScript(hook.command, input, cwd, (hook.timeout ?? 10) * 1000).then(
          (result) => {
            const durationMs = Math.round(performance.now() - hookStart)
            tel('hook.executed', { hook: hookName, duration_ms: durationMs, exit_code: result.code })
          },
          (err) => {
            const durationMs = Math.round(performance.now() - hookStart)
            tel('hook.executed', {
              hook: hookName,
              duration_ms: durationMs,
              exit_code: null,
              error: err instanceof Error ? err.message : 'unknown error',
            })
          },
        )
        continue
      }
      let result: HookResult
      try {
        result = await runHookScript(hook.command, input, cwd, (hook.timeout ?? 10) * 1000)
      } catch (err) {
        const durationMs = Math.round(performance.now() - hookStart)
        tel('hook.executed', {
          hook: hookName,
          duration_ms: durationMs,
          exit_code: null,
          error: err instanceof Error ? err.message : 'unknown error',
        })
        // Re-throw: preserve existing timeout/spawn-failure behavior.
        throw err
      }
      const durationMs = Math.round(performance.now() - hookStart)
      tel('hook.executed', { hook: hookName, duration_ms: durationMs, exit_code: result.code })

      // Exit 2 = hard error: block immediately.
      if (result.code === 2) {
        const reason = result.stderr.trim() || `Blocked by ${event} hook`
        return { block: true, reason }
      }

      // Other non-zero = non-blocking warning (Claude Code contract): surface
      // the message but let the tool proceed. Continue to the next hook.
      if (result.code !== 0) {
        const msg = result.stderr.trim()
        if (msg && warning === undefined) warning = msg
        continue
      }

      const stdout = result.stdout.trim()
      if (stdout.length > 0) {
        try {
          const parsed = JSON.parse(stdout) as {
            decision?: string
            reason?: string
            hookSpecificOutput?: {
              permissionDecision?: string
              permissionDecisionReason?: string
              updatedInput?: Record<string, unknown>
            }
          }
          const hookOutput = parsed.hookSpecificOutput
          // Claude Code PreToolUse block-by-JSON contract (exit 0): permissionDecision "deny"
          // maps to the SDK's tool_call { block, reason } return. Without this, denyToolUse-based
          // guards (exit 0 + JSON) silently fail to block under OMP.
          if (hookOutput?.permissionDecision === 'deny') {
            return { block: true, reason: hookOutput.permissionDecisionReason ?? `Blocked by ${event} hook` }
          }
          // Top-level decision "block" contract (PostToolUse / Stop family).
          if (parsed.decision === 'block') {
            return { block: true, reason: parsed.reason ?? `Blocked by ${event} hook` }
          }
          // NOTE: the OMP SDK's tool_call event can BLOCK but cannot REWRITE tool input
          // (only tool_result can modify). updatedInput is applied best-effort and is not
          // guaranteed to affect execution — full input-rewrite parity is not achievable here.
          if (hookOutput?.updatedInput) {
            input = { ...input, ...hookOutput.updatedInput }
            inputModified = true
          }
        } catch {
          // Non-JSON stdout is ignored for non-UserPromptSubmit events.
        }
      }
    }
  }

  return { ...(inputModified ? { updatedInput: input } : {}), ...(warning !== undefined ? { warning } : {}) }
}

async function runPreToolUseHooks(
  settings: HookSettings,
  event: ToolCallEvent,
  ctx: ExtensionContext,
): Promise<{ block?: boolean; reason?: string } | undefined> {
  const claudeToolName = normalizeToolName(event.toolName)
  const input: Record<string, unknown> = {
    ...getSessionIds(ctx),
    tool_name: claudeToolName,
    tool_input: normalizeToolInput(claudeToolName, event.input as Record<string, unknown>),
    tool_call_id: event.toolCallId,
  }

  const shellCommand = extractShellCommand(event.toolName, event.input as Record<string, unknown>)
  if (shellCommand !== undefined && shellCommand.length > 0) {
    const bashInput: Record<string, unknown> = {
      ...getSessionIds(ctx),
      tool_name: 'Bash',
      tool_input: { command: shellCommand },
      tool_call_id: event.toolCallId,
    }
    const bashResult = await runHooksForEvent(settings.hooks.PreToolUse, 'Bash', bashInput, ctx, 'PreToolUse')
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

  const result = await runHooksForEvent(settings.hooks.PreToolUse, claudeToolName, input, ctx, 'PreToolUse')

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

  // NOTE: OMP's tool_call event only supports blocking; it cannot rewrite the
  // tool input that the runtime will execute. The mutation below is attempted
  // for compatibility but is not guaranteed to affect execution. Input-rewriting
  // hooks (strip-head-tail, vitest-rewrite) may need native OMP conversion.
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
}

async function runPostToolUseHooks(
  settings: HookSettings,
  event: ToolResultEvent,
  ctx: ExtensionContext,
): Promise<{ readonly block?: boolean; readonly reason?: string; readonly warning?: string }> {
  const claudeToolName = normalizeToolName(event.toolName)
  const input: Record<string, unknown> = {
    ...getSessionIds(ctx),
    tool_name: claudeToolName,
    tool_input: normalizeToolInput(claudeToolName, event.input),
    tool_call_id: event.toolCallId,
    output: event.content,
    is_error: event.isError ?? false,
  }

  return runHooksForEvent(settings.hooks.PostToolUse, claudeToolName, input, ctx, 'PostToolUse')
}

async function runUserPromptSubmitHooks(
  settings: HookSettings,
  event: InputEvent,
  ctx: ExtensionContext,
): Promise<InputEventResult | undefined> {
  const entries = settings.hooks.UserPromptSubmit
  if (entries.length === 0) return undefined

  const cwd = ctx.cwd
  let injected = ''
  const input: Record<string, unknown> = {
    ...getSessionIds(ctx),
    prompt: event.text,
    source: event.source,
  }

  for (const entry of entries) {
    for (const hook of entry.hooks) {
      const result = await runHookScript(hook.command, input, cwd, (hook.timeout ?? 10) * 1000)

      if (result.code !== 0) {
        // UserPromptSubmit hooks are advisory; non-zero exits are ignored.
        continue
      }

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
}

async function runSessionStartHooks(
  settings: HookSettings,
  reason: string,
  ctx: ExtensionContext,
): Promise<void> {
  const entries = settings.hooks.SessionStart
  if (entries.length === 0) return

  const cwd = ctx.cwd
  const input: Record<string, unknown> = { ...getSessionIds(ctx), reason }

  for (const entry of entries) {
    if (entry.matcher && !matchesMatcher(reason, entry.matcher)) continue

    for (const hook of entry.hooks) {
      // Lifecycle hooks never block the session: async hooks are fire-and-forget, and
      // even sync ones must not reject — a slow/failing SessionStart hook (e.g. a wiki
      // index refresh) cannot be allowed to crash startup.
      const hookName = hook.command.split(/[\\/]/).pop() ?? hook.command
      if (hook.async) {
        runHookScript(hook.command, input, cwd, (hook.timeout ?? 10) * 1000).then(
          (result) => {
            tel('hook.executed', { hook: hookName, exit_code: result.code })
          },
          (err) => {
            tel('hook.executed', {
              hook: hookName,
              exit_code: null,
              error: err instanceof Error ? err.message : 'unknown error',
            })
          },
        )
        continue
      }
      await runHookScript(hook.command, input, cwd, (hook.timeout ?? 10) * 1000).then(
        (result) => {
          tel('hook.executed', { hook: hookName, exit_code: result.code })
        },
        (err) => {
          tel('hook.executed', {
            hook: hookName,
            exit_code: null,
            error: err instanceof Error ? err.message : 'unknown error',
          })
        },
      )
    }
  }
}

// Lifecycle runners (SessionEnd, Stop) never block the session: sync and
// async hook failures are swallowed alike.
async function runLifecycleHooks(entries: readonly HookEntry[], ctx: ExtensionContext): Promise<void> {
  if (entries.length === 0) return

  const cwd = ctx.cwd
  const input: Record<string, unknown> = { ...getSessionIds(ctx) }

  for (const entry of entries) {
    for (const hook of entry.hooks) {
      const hookName = hook.command.split(/[\\/]/).pop() ?? hook.command
      if (hook.async) {
        runHookScript(hook.command, input, cwd, (hook.timeout ?? 10) * 1000).then(
          (result) => {
            tel('hook.executed', { hook: hookName, exit_code: result.code })
          },
          (err) => {
            tel('hook.executed', {
              hook: hookName,
              exit_code: null,
              error: err instanceof Error ? err.message : 'unknown error',
            })
          },
        )
      } else {
        await runHookScript(hook.command, input, cwd, (hook.timeout ?? 10) * 1000).then(
          (result) => {
            tel('hook.executed', { hook: hookName, exit_code: result.code })
          },
          (err) => {
            tel('hook.executed', {
              hook: hookName,
              exit_code: null,
              error: err instanceof Error ? err.message : 'unknown error',
            })
          },
        )
      }
    }
  }
}
