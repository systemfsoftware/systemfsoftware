import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

import { Workflow } from '@systemfsoftware/effect-cell-types'

const TOOL_VARIABLES = ['CLAUDECODE', 'CODEX_SANDBOX'] as const

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

const hasToolSignal = (command: ResolveModeCommand): boolean => {
  const toolVars = command.toolVars ?? {}
  return TOOL_VARIABLES.some((variable) => {
    const value = toolVars[variable]
    return typeof value === 'string' && value.length > 0
  })
}

type ResolveModeKind =
  | 'Conflict'
  | 'TextFlag'
  | 'JsonFlag'
  | 'EnvMachine'
  | 'EnvHuman'
  | 'TtyMachine'
  | 'Agent'
  | 'Tool'
  | 'TtyHuman'

const MODE_RULES: ReadonlyArray<{
  readonly kind: ResolveModeKind
  readonly matches: (command: ResolveModeCommand) => boolean
}> = [
  { kind: 'Conflict', matches: (command) => command.text === true && command.json === true },
  { kind: 'TextFlag', matches: (command) => command.text === true },
  { kind: 'JsonFlag', matches: (command) => command.json === true },
  { kind: 'EnvMachine', matches: (command) => (command.envMode ?? '') === 'machine' },
  { kind: 'EnvHuman', matches: (command) => (command.envMode ?? '') !== '' },
  { kind: 'TtyMachine', matches: (command) => !command.stdoutIsTTY },
  { kind: 'Agent', matches: (command) => (command.agent ?? '') !== '' },
  { kind: 'Tool', matches: (command) => hasToolSignal(command) },
]

const toKind = (command: ResolveModeCommand): ResolveModeKind =>
  MODE_RULES.find((rule) => rule.matches(command))?.kind ?? 'TtyHuman'

export const resolveOutputMode = Workflow.make(
  ResolveModeCommand,
  (command: ResolveModeCommand): Result.Result<ResolveModeDecision, ModeConflictError> =>
    Match.value(toKind(command)).pipe(
      Match.when(
        'Conflict',
        () => Result.fail(ModeConflictError.make({ option: 'json', value: 'text', expected: CONFLICT_EXPECTED })),
      ),
      Match.when(
        'TextFlag',
        () => Result.succeed(HumanOutput.make({ signal: 'flag', stdoutIsTTY: command.stdoutIsTTY })),
      ),
      Match.when(
        'JsonFlag',
        () => Result.succeed(MachineOutput.make({ signal: 'flag', stdoutIsTTY: command.stdoutIsTTY })),
      ),
      Match.when(
        'EnvMachine',
        () => Result.succeed(MachineOutput.make({ signal: 'env', stdoutIsTTY: command.stdoutIsTTY })),
      ),
      Match.when(
        'EnvHuman',
        () => Result.succeed(HumanOutput.make({ signal: 'env', stdoutIsTTY: command.stdoutIsTTY })),
      ),
      Match.when('TtyMachine', () => Result.succeed(MachineOutput.make({ signal: 'tty', stdoutIsTTY: false }))),
      Match.when('Agent', () => Result.succeed(MachineOutput.make({ signal: 'agent', stdoutIsTTY: true }))),
      Match.when('Tool', () => Result.succeed(MachineOutput.make({ signal: 'tool', stdoutIsTTY: true }))),
      Match.when('TtyHuman', () => Result.succeed(HumanOutput.make({ signal: 'tty', stdoutIsTTY: true }))),
      Match.exhaustive,
    ),
)
