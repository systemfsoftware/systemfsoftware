import * as Result from 'effect/Result'
import * as CliError from 'effect/unstable/cli/CliError'

import type { ResolvedMode } from '@systemfsoftware/stryker-js-mutation-run/output-mode'

/**
 * The known tool variables. Narrow per the plan — exactly
 * `['CLAUDECODE', 'CODEX_SANDBOX']` — and load-bearing rather than a
 * fallback: they cover the PTY-allocating harnesses a stdin condition would
 * have rescued.
 */
export const TOOL_VARIABLES = ['CLAUDECODE', 'CODEX_SANDBOX'] as const

export type ToolVariable = (typeof TOOL_VARIABLES)[number]

export interface FormatFlags {
  readonly text?: boolean
  readonly json?: boolean
}

export interface ModeInput extends FormatFlags {
  readonly envMode?: string
  readonly stdoutIsTTY: boolean
  readonly agent?: string
  readonly toolVars?: Readonly<Partial<Record<ToolVariable, string | undefined>>>
}

/**
 * Resolves the output mode by R4 precedence. Pure — reads nothing, so it is
 * fully testable; the caller supplies every input once at startup. The
 * mutually-exclusive-flags case is a caller error, returned as a `failure` so
 * the function stays total.
 */
export function resolveMode(
  input: ModeInput,
): Result.Result<ResolvedMode, CliError.CliError> {
  // The two flags contradict each other and are a caller error, never a
  // silent winner.
  if (input.text === true && input.json === true) {
    return Result.fail(
      CliError.InvalidValue.make({
        option: 'json',
        value: 'text',
        expected: 'the "--format text" and "--json" flags are mutually exclusive — use one or the other',
        kind: 'flag',
      }),
    )
  }
  if (input.text === true) {
    return Result.succeed({ mode: 'human', signal: 'flag', stdoutIsTTY: input.stdoutIsTTY })
  }
  if (input.json === true) {
    return Result.succeed({ mode: 'machine', signal: 'flag', stdoutIsTTY: input.stdoutIsTTY })
  }
  // Set-but-empty falls through to detection, the same way an empty AGENT
  // does; only the literal 'machine' activates machine mode.
  if (input.envMode !== undefined && input.envMode.length > 0) {
    return Result.succeed({
      mode: input.envMode === 'machine' ? 'machine' : 'human',
      signal: 'env',
      stdoutIsTTY: input.stdoutIsTTY,
    })
  }
  // Stdout is the primary signal — it is what the output is written to.
  if (!input.stdoutIsTTY) {
    return Result.succeed({ mode: 'machine', signal: 'tty', stdoutIsTTY: false })
  }
  // AGENT is additive: any non-empty value means machine mode.
  if (input.agent !== undefined && input.agent.length > 0) {
    return Result.succeed({ mode: 'machine', signal: 'agent', stdoutIsTTY: true })
  }
  for (const variable of TOOL_VARIABLES) {
    const value = input.toolVars?.[variable]
    if (value !== undefined && value.length > 0) {
      return Result.succeed({ mode: 'machine', signal: 'tool', stdoutIsTTY: true })
    }
  }
  return Result.succeed({ mode: 'human', signal: 'tty', stdoutIsTTY: true })
}

/**
 * The progress bar's gate. Human mode on a non-TTY stdout (AE1) must not leak
 * its control sequences into a pipe, and machine mode keeps stdout clean for
 * the verdict envelope (R5). Decided from the resolved mode's own detection
 * data — never a second `isTTY` probe.
 */
export function isProgressEnabled(resolved: ResolvedMode): boolean {
  return resolved.mode === 'human' && resolved.stdoutIsTTY
}

/**
 * The log colouriser's gate (R8). Machine mode never emits colour, so a
 * harness merging `2>&1` is not handed escape sequences it must strip, and
 * `NO_COLOR` is honoured for the human path per the convention: any value
 * other than an unset or empty variable disables colour.
 */
export function isColorEnabled(resolved: ResolvedMode, noColor: string | undefined): boolean {
  return resolved.mode === 'human' && (noColor === undefined || noColor.length === 0)
}
