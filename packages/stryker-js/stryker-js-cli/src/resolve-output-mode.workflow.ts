import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
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

const configured = (value: string | undefined): Option.Option<string> =>
  Option.filter(Option.fromNullishOr(value), (text) => text.length > 0)

const modeFromEnv = (envMode: string, stdoutIsTTY: boolean): ResolveModeDecision =>
  Match.value(envMode).pipe(
    Match.when('machine', () => MachineOutput.make({ signal: 'env', stdoutIsTTY })),
    Match.orElse(() => HumanOutput.make({ signal: 'env', stdoutIsTTY })),
  )

const modeFromAgent = (command: ResolveModeCommand): ResolveModeDecision =>
  Option.match(configured(command.agent), {
    onNone: () => modeFromTools(command),
    onSome: () => MachineOutput.make({ signal: 'agent', stdoutIsTTY: true }),
  })

const modeFromTools = (command: ResolveModeCommand): ResolveModeDecision =>
  Match.value(anyToolVariableSet(command.toolVars)).pipe(
    Match.when(true, () => MachineOutput.make({ signal: 'tool', stdoutIsTTY: true })),
    Match.orElse(() => HumanOutput.make({ signal: 'tty', stdoutIsTTY: true })),
  )

const anyToolVariableSet = (toolVars: Readonly<Record<string, string>> | undefined): boolean =>
  Option.match(Option.fromNullishOr(toolVars), {
    onNone: () => false,
    onSome: (named) => TOOL_VARIABLES.some((variable) => Option.isSome(configured(named[variable]))),
  })

const modeBelowEnv = (command: ResolveModeCommand): ResolveModeDecision =>
  Match.value(command.stdoutIsTTY).pipe(
    Match.when(false, () => MachineOutput.make({ signal: 'tty', stdoutIsTTY: false })),
    Match.orElse(() => modeFromAgent(command)),
  )

const modeFromEnvironment = (command: ResolveModeCommand): ResolveModeDecision =>
  Option.match(configured(command.envMode), {
    onNone: () => modeBelowEnv(command),
    onSome: (envMode) => modeFromEnv(envMode, command.stdoutIsTTY),
  })

const decideMode = (command: ResolveModeCommand): Result.Result<ResolveModeDecision, ModeConflictError> =>
  Match.value(command).pipe(
    Match.when({ text: true, json: true }, () =>
      Result.fail(
        ModeConflictError.make({
          option: 'json',
          value: 'text',
          expected: CONFLICT_EXPECTED,
        }),
      )),
    Match.when(
      { text: true },
      (texted) => Result.succeed(HumanOutput.make({ signal: 'flag', stdoutIsTTY: texted.stdoutIsTTY })),
    ),
    Match.when(
      { json: true },
      (jsoned) => Result.succeed(MachineOutput.make({ signal: 'flag', stdoutIsTTY: jsoned.stdoutIsTTY })),
    ),
    Match.orElse((rest) => Result.succeed(modeFromEnvironment(rest))),
  )

export const resolveOutputMode = Workflow.make(ResolveModeCommand, decideMode)
