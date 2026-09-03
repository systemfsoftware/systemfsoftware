import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

import { Workflow } from '@systemfsoftware/effect-cell-types'

const TOOL_VARIABLES = ['CLAUDECODE', 'CODEX_SANDBOX'] as const

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

const ResolveModeTypeId: unique symbol = Symbol.for('@systemfsoftware/stryker-js-cli/ResolveMode')
type ResolveModeTypeId = typeof ResolveModeTypeId

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
}) {
  readonly [ResolveModeTypeId] = ResolveModeTypeId
}

const ModeSignal = S.Literals(['flag', 'env', 'tty', 'agent', 'tool'])

export class HumanOutput extends S.TaggedClass<HumanOutput>()('HumanOutput', {
  signal: ModeSignal,
  stdoutIsTTY: S.Boolean,
}) {
  readonly [ResolveModeTypeId] = ResolveModeTypeId
}

export class MachineOutput extends S.TaggedClass<MachineOutput>()('MachineOutput', {
  signal: ModeSignal,
  stdoutIsTTY: S.Boolean,
}) {
  readonly [ResolveModeTypeId] = ResolveModeTypeId
}

export type ResolveModeDecision = HumanOutput | MachineOutput

const CONFLICT_EXPECTED = 'the "--format text" and "--json" flags are mutually exclusive — use one or the other'

function r4(command: ResolveModeCommand): Result.Result<ResolveModeDecision, ModeConflictError> {
  if (command.text === true && command.json === true) {
    return Result.fail(
      ModeConflictError.make({
        option: 'json',
        value: 'text',
        expected: CONFLICT_EXPECTED,
      }),
    )
  }
  if (command.text === true) {
    return Result.succeed(HumanOutput.make({ signal: 'flag', stdoutIsTTY: command.stdoutIsTTY }))
  }
  if (command.json === true) {
    return Result.succeed(MachineOutput.make({ signal: 'flag', stdoutIsTTY: command.stdoutIsTTY }))
  }
  if (command.envMode !== undefined && command.envMode.length > 0) {
    if (command.envMode === 'machine') {
      return Result.succeed(MachineOutput.make({ signal: 'env', stdoutIsTTY: command.stdoutIsTTY }))
    }
    return Result.succeed(HumanOutput.make({ signal: 'env', stdoutIsTTY: command.stdoutIsTTY }))
  }
  if (!command.stdoutIsTTY) {
    return Result.succeed(MachineOutput.make({ signal: 'tty', stdoutIsTTY: false }))
  }
  if (command.agent !== undefined && command.agent.length > 0) {
    return Result.succeed(MachineOutput.make({ signal: 'agent', stdoutIsTTY: true }))
  }
  const toolVars = command.toolVars ?? {}
  for (const variable of TOOL_VARIABLES) {
    const value = toolVars[variable]
    if (typeof value === 'string' && value.length > 0) {
      return Result.succeed(MachineOutput.make({ signal: 'tool', stdoutIsTTY: true }))
    }
  }
  return Result.succeed(HumanOutput.make({ signal: 'tty', stdoutIsTTY: true }))
}

function modeDecision(
  command: ResolveModeCommand,
): Result.Result<ResolveModeDecision, ModeConflictError> {
  return r4(command)
}

export const resolveModeWorkflow = Workflow.make(ResolveModeCommand, modeDecision)
