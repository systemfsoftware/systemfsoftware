import * as HelpDoc from '@effect/cli/HelpDoc'
import * as ValidationError from '@effect/cli/ValidationError'

/**
 * U3 — mode detection and output routing.
 *
 * One resolved mode decides every output decision for a run, and an explicit
 * flag can always override it (R4). The signal that decided is recorded so a
 * misclassified caller can diagnose without guessing — the verdict envelope
 * (U4) carries it.
 *
 * Precedence (R4): explicit `--format`/`--json` flag, then `STRYKER_MODE`,
 * then `!stdout.isTTY`, then `AGENT` non-empty, then a known tool variable,
 * then human. There is no stdin condition — R4 reverted it after it
 * misclassified `stryker run < /dev/null` in a terminal as an agent; the
 * PTY-allocating harnesses it was meant to rescue are covered by the
 * tool-variable list instead.
 */

export type OutputMode = 'human' | 'machine'

/**
 * Which input decided the resolved mode, for the envelope (U4): `flag` — an
 * explicit `--format`/`--json` override; `env` — `STRYKER_MODE`; `tty` —
 * stdout TTY state; `agent` — `AGENT` set to a non-empty value; `tool` — a
 * known tool variable set.
 */
export type ModeSignal = 'flag' | 'env' | 'tty' | 'agent' | 'tool'

/**
 * The resolved mode plus the signal that decided it. `stdoutIsTTY` rides
 * along as the detection data the decision was made from, so the progress
 * bar's gate reuses the same inputs instead of probing stdout a second time.
 */
export interface ResolvedMode {
  readonly mode: OutputMode
  readonly signal: ModeSignal
  readonly stdoutIsTTY: boolean
}

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
 * fully testable; the caller supplies every input once at startup.
 */
export function resolveMode(input: ModeInput): ResolvedMode {
  // The two flags contradict each other and are a caller error, never a
  // silent winner.
  if (input.text === true && input.json === true) {
    throw ValidationError.invalidValue(
      HelpDoc.p(
        'The "--format text" and "--json" flags are mutually exclusive — use one or the other',
      ),
    )
  }
  if (input.text === true) {
    return { mode: 'human', signal: 'flag', stdoutIsTTY: input.stdoutIsTTY }
  }
  if (input.json === true) {
    return { mode: 'machine', signal: 'flag', stdoutIsTTY: input.stdoutIsTTY }
  }
  // Set-but-empty falls through to detection, the same way an empty AGENT
  // does; only the literal 'machine' activates machine mode.
  if (input.envMode !== undefined && input.envMode.length > 0) {
    return {
      mode: input.envMode === 'machine' ? 'machine' : 'human',
      signal: 'env',
      stdoutIsTTY: input.stdoutIsTTY,
    }
  }
  // Stdout is the primary signal — it is what the output is written to.
  if (!input.stdoutIsTTY) {
    return { mode: 'machine', signal: 'tty', stdoutIsTTY: false }
  }
  // AGENT is additive: any non-empty value means machine mode.
  if (input.agent !== undefined && input.agent.length > 0) {
    return { mode: 'machine', signal: 'agent', stdoutIsTTY: true }
  }
  for (const variable of TOOL_VARIABLES) {
    const value = input.toolVars?.[variable]
    if (value !== undefined && value.length > 0) {
      return { mode: 'machine', signal: 'tool', stdoutIsTTY: true }
    }
  }
  return { mode: 'human', signal: 'tty', stdoutIsTTY: true }
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
