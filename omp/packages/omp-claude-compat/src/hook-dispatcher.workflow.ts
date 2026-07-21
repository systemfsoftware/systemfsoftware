/**
 * Pure decision core for the OMP hook dispatcher bridge.
 *
 * Every function here is a total, pure function: data in → data out.
 * No Effect runtime, no I/O, no ambient state. Property-tested.
 */
import { Match } from 'effect'
import { resolve } from 'node:path'

// ── Types ──

export interface HookResult {
  readonly code: number
  readonly stdout: string
  readonly stderr: string
}

export type HookDecision =
  | { readonly _tag: 'Block'; readonly reason: string }
  | { readonly _tag: 'Allow' }
  | { readonly _tag: 'Warning'; readonly message: string }
const matchIsBlock = Match.type<HookDecision>().pipe(
  Match.tag('Block', () => true),
  Match.tag('Warning', () => false),
  Match.tag('Allow', () => false),
  Match.exhaustive,
)

const matchIsWarning = Match.type<HookDecision>().pipe(
  Match.tag('Block', () => false),
  Match.tag('Warning', () => true),
  Match.tag('Allow', () => false),
  Match.exhaustive,
)

export function isBlockDecision(d: HookDecision): d is Extract<HookDecision, { readonly _tag: 'Block' }> {
  return matchIsBlock(d)
}

export function isWarningDecision(d: HookDecision): d is Extract<HookDecision, { readonly _tag: 'Warning' }> {
  return matchIsWarning(d)
}
export interface ParsedHookOutput {
  readonly decision?: string
  readonly reason?: string
  readonly hookSpecificOutput?: {
    readonly permissionDecision?: string
    readonly permissionDecisionReason?: string
    readonly updatedInput?: Record<string, unknown>
  }
}

// ── Hook output parsing ──

/** Parse JSON stdout from a hook script. Returns null on failure or non-object. */
export function parseHookOutput(stdout: string): ParsedHookOutput | null {
  const trimmed = stdout.trim()
  if (trimmed.length === 0) return null
  try {
    const parsed: unknown = JSON.parse(trimmed)
    if (parsed === null || typeof parsed !== 'object') return null
    return parsed as ParsedHookOutput
  } catch {
    return null
  }
}

// ── Hook result interpretation ──

/**
 * The core decision: given a hook result, should we block, warn, or allow?
 *
 * Claude Code contract:
 * - Exit 2 → hard block (stderr is the reason)
 * - Other non-zero → non-blocking warning (stderr is the message)
 * - Exit 0 → parse stdout for JSON decisions:
 *   - hookSpecificOutput.permissionDecision "deny" → block
 *   - decision "block" → block
 *   - hookSpecificOutput.updatedInput → allow (input mutation attempted upstream)
 *   - anything else → allow
 */
export function interpretHookResult(
  result: HookResult,
  event: string,
): HookDecision {
  if (result.code === 2) {
    const reason = result.stderr.trim() || `Blocked by ${event} hook`
    return { _tag: 'Block', reason }
  }

  if (result.code !== 0) {
    const msg = result.stderr.trim()
    if (msg.length > 0) return { _tag: 'Warning', message: msg }
    return { _tag: 'Allow' }
  }

  const parsed = parseHookOutput(result.stdout)
  if (parsed) {
    if (parsed.hookSpecificOutput?.permissionDecision === 'deny') {
      return {
        _tag: 'Block',
        reason: parsed.hookSpecificOutput.permissionDecisionReason ?? `Blocked by ${event} hook`,
      }
    }
    if (parsed.decision === 'block') {
      return { _tag: 'Block', reason: parsed.reason ?? `Blocked by ${event} hook` }
    }
  }

  return { _tag: 'Allow' }
}

// ── Command resolution ──

export interface ResolvedCommand {
  readonly cmd: string
  readonly args: readonly string[]
}

/**
 * Determine how to execute a hook command.
 *
 * - `.ts` files → run via `bun <path>`
 * - everything else → run via `sh -c <command>`
 */
export function resolveCommandPath(command: string, cwd: string): ResolvedCommand {
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
    const scriptPath = resolve(cwd, pathPart)
    return { cmd: 'bun', args: [scriptPath] }
  }

  return { cmd: 'sh', args: ['-c', unquoted] }
}

// ── Settings parsing ──

export interface HookCommand {
  readonly type: 'command'
  readonly command: string
  readonly async?: boolean
  readonly timeout?: number
}

export interface HookEntry {
  readonly matcher?: string
  readonly hooks: readonly HookCommand[]
}

export interface HookSettings {
  readonly hooks: {
    readonly Stop: readonly HookEntry[]
    readonly SessionStart: readonly HookEntry[]
    readonly SessionEnd: readonly HookEntry[]
    readonly UserPromptSubmit: readonly HookEntry[]
    readonly PreToolUse: readonly HookEntry[]
    readonly PostToolUse: readonly HookEntry[]
  }
}

/**
 * Parse a settings.json payload into HookSettings.
 * Returns null on any parse failure or missing hooks key.
 */
export function parseSettings(json: unknown): HookSettings | null {
  if (typeof json !== 'object' || json === null) return null
  const data = json as Record<string, unknown>
  const source = (data['hooks'] ?? data) as Record<string, unknown>
  if (typeof source !== 'object' || source === null) return null

  const group = (key: string): HookEntry[] => Array.isArray(source[key]) ? (source[key] as HookEntry[]) : []

  const hooks: HookSettings['hooks'] = {
    PreToolUse: group('PreToolUse'),
    PostToolUse: group('PostToolUse'),
    UserPromptSubmit: group('UserPromptSubmit'),
    Stop: group('Stop'),
    SessionStart: group('SessionStart'),
    SessionEnd: group('SessionEnd'),
  }

  return { hooks }
}

/**
 * Extract the hook script name from a command path.
 * E.g. `/path/to/hooks/validate.ts` → `validate.ts`
 */
export function hookNameFromCommand(command: string): string {
  return command.split(/[\\/]/).pop() ?? command
}
