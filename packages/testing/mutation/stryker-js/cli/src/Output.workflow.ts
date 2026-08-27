import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

import { Workflow } from '@systemfsoftware/effect-cell-types'
import { type ResolvedMode } from '@systemfsoftware/stryker-js-platform-node'

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
 * The command of the output-mode workflow: a schema class, because `Workflow.make`
 * derives the command type from it and pins the error channel at the construction site.
 */
export class ResolveModeCommand extends S.TaggedClass<ResolveModeCommand>()('ResolveModeCommand', {
  stdoutIsTTY: S.Boolean,
  text: S.optional(S.Boolean),
  json: S.optional(S.Boolean),
  envMode: S.optional(S.String),
  agent: S.optional(S.String),
  toolVars: S.optional(S.Record(S.String, S.String)),
}) {}

/**
 * The conflict error for mutually exclusive format flags. Defined locally so the
 * workflow decision remains pure — the sealed effect surface does not include
 * `effect/unstable/cli/CliError`, so the decision returns this local error and
 * the shell maps it to `CliError.InvalidValue` at the boundary.
 */
export class ModeConflictError extends S.TaggedError<ModeConflictError>()('ModeConflictError', {
  option: S.String,
  value: S.String,
  expected: S.String,
  kind: S.Literal('flag'),
}) {}

type ModeVerdict =
  | { readonly kind: 'conflict' }
  | { readonly kind: 'humanFlag' }
  | { readonly kind: 'machineFlag' }
  | { readonly kind: 'machineEnv' }
  | { readonly kind: 'humanEnv' }
  | { readonly kind: 'machineTtyOff' }
  | { readonly kind: 'machineAgent' }
  | { readonly kind: 'machineTool' }
  | { readonly kind: 'human' }

function modeVerdict(command: ResolveModeCommand): ModeVerdict {
  if (command.text === true && command.json === true) {
    return { kind: 'conflict' }
  }
  if (command.text === true) {
    return { kind: 'humanFlag' }
  }
  if (command.json === true) {
    return { kind: 'machineFlag' }
  }
  if (command.envMode !== undefined && command.envMode.length > 0) {
    if (command.envMode === 'machine') {
      return { kind: 'machineEnv' }
    }
    return { kind: 'humanEnv' }
  }
  if (!command.stdoutIsTTY) {
    return { kind: 'machineTtyOff' }
  }
  if (command.agent !== undefined && command.agent.length > 0) {
    return { kind: 'machineAgent' }
  }
  const toolVars = command.toolVars ?? {}
  for (const variable of TOOL_VARIABLES) {
    const value = toolVars[variable]
    if (typeof value === 'string' && value.length > 0) {
      return { kind: 'machineTool' }
    }
  }
  return { kind: 'human' }
}

/**
 * Resolves the output mode by R4 precedence. Pure — reads nothing, so it is
 * total. The workflow dispatches over the verdict so the decision body is a
 * single exhaustive Match.
 */
export function modeDecision(
  command: ResolveModeCommand,
): Result.Result<ResolvedMode, ModeConflictError> {
  return Match.value(modeVerdict(command)).pipe(
    Match.when({ kind: 'conflict' }, () =>
      Result.fail(
        ModeConflictError.make({
          option: 'json',
          value: 'text',
          expected: 'the "--format text" and "--json" flags are mutually exclusive — use one or the other',
          kind: 'flag',
        }),
      )),
    Match.when(
      { kind: 'humanFlag' },
      () => Result.succeed({ mode: 'human' as const, signal: 'flag' as const, stdoutIsTTY: command.stdoutIsTTY }),
    ),
    Match.when(
      { kind: 'machineFlag' },
      () => Result.succeed({ mode: 'machine' as const, signal: 'flag' as const, stdoutIsTTY: command.stdoutIsTTY }),
    ),
    Match.when(
      { kind: 'machineEnv' },
      () => Result.succeed({ mode: 'machine' as const, signal: 'env' as const, stdoutIsTTY: command.stdoutIsTTY }),
    ),
    Match.when(
      { kind: 'humanEnv' },
      () => Result.succeed({ mode: 'human' as const, signal: 'env' as const, stdoutIsTTY: command.stdoutIsTTY }),
    ),
    Match.when(
      { kind: 'machineTtyOff' },
      () => Result.succeed({ mode: 'machine' as const, signal: 'tty' as const, stdoutIsTTY: false }),
    ),
    Match.when(
      { kind: 'machineAgent' },
      () => Result.succeed({ mode: 'machine' as const, signal: 'agent' as const, stdoutIsTTY: true }),
    ),
    Match.when(
      { kind: 'machineTool' },
      () => Result.succeed({ mode: 'machine' as const, signal: 'tool' as const, stdoutIsTTY: true }),
    ),
    Match.orElse(() => Result.succeed({ mode: 'human' as const, signal: 'tty' as const, stdoutIsTTY: true })),
  )
}

/**
 * The output-mode decision: the pure `modeDecision` wrapped as a workflow so
 * `Cell.decide` can demand it by type. Both channels are inhabited — `ResolvedMode`
 * on success and a tagged `ModeConflictError` on failure — so the brand is satisfied.
 */
export const resolveModeWorkflow = Workflow.make(ResolveModeCommand, modeDecision)
