import { Workflow } from '@systemfsoftware/effect-cell-types'
import type { ExitClass } from '@systemfsoftware/stryker-js/ExitClass'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'
import { ExitClassPayload } from './run/abi-payload.schema.js'

export class RunOutcomeCommand extends S.TaggedClass<RunOutcomeCommand>()('RunOutcomeCommand', {
  succeeded: S.Boolean,
  signal: S.optional(S.Finite),
  interrupted: S.Boolean,
  helpErrorCount: S.optional(S.Finite),
  cliError: S.Boolean,
  unrecognized: S.optional(S.String),
  survivorsReason: S.optional(S.Literals(['no-report', 'mismatch'])),
  survivorsDiagnostic: S.optional(S.String),
  schemaError: S.Boolean,
  successExitClass: S.optional(ExitClassPayload),
  highestExitClass: S.optional(ExitClassPayload),
  configDetail: S.optional(S.String),
  diagnostic: S.optional(S.String),
}) {}

const CONFIG_CODE = 2

const classCode = (exitClass: ExitClass): number =>
  Match.value(exitClass).pipe(
    Match.when('VerdictFail', () => 1),
    Match.when('ConfigError', () => CONFIG_CODE),
    Match.when('RuntimeError', () => 3),
    Match.when('InternalError', () => 4),
    Match.exhaustive,
  )

const RunOutcomeTypeId: unique symbol = Symbol.for('@systemfsoftware/stryker-js-cli/RunOutcome')
type RunOutcomeTypeId = typeof RunOutcomeTypeId

export class RunOk extends S.TaggedClass<RunOk>()('RunOk', {
  help: S.Boolean,
}) {
  readonly [RunOutcomeTypeId] = RunOutcomeTypeId
}

export class RunInterrupted extends S.TaggedError<RunInterrupted>()('RunInterrupted', {
  code: S.Finite,
}) {
  readonly [RunOutcomeTypeId] = RunOutcomeTypeId
}

export class RunParseFailed extends S.TaggedClass<RunParseFailed>()('RunParseFailed', {
  unrecognized: S.optional(S.String),
}) {
  readonly [RunOutcomeTypeId] = RunOutcomeTypeId
}

export class RunSurvivorsRejected extends S.TaggedClass<RunSurvivorsRejected>()('RunSurvivorsRejected', {
  reason: S.Literals(['no-report', 'mismatch']),
  diagnostic: S.optional(S.String),
}) {
  readonly [RunOutcomeTypeId] = RunOutcomeTypeId
}

export class RunConfigFailed extends S.TaggedClass<RunConfigFailed>()('RunConfigFailed', {
  detail: S.optional(S.String),
}) {
  readonly [RunOutcomeTypeId] = RunOutcomeTypeId
}

export class RunFailed extends S.TaggedClass<RunFailed>()('RunFailed', {
  code: S.Finite,
  diagnostic: S.optional(S.String),
}) {
  readonly [RunOutcomeTypeId] = RunOutcomeTypeId
}

export type RunOutcomeDecision =
  | RunOk
  | RunParseFailed
  | RunSurvivorsRejected
  | RunConfigFailed
  | RunFailed

export type RunOutcomeError = RunInterrupted

export type FailedRunOutcome = Exclude<RunOutcomeDecision, RunOk> | RunOutcomeError

type SignaledCommand = RunOutcomeCommand & { readonly signal: number }
type SucceededCommand = RunOutcomeCommand & { readonly succeeded: true }
type HelpCommand = RunOutcomeCommand & { readonly helpErrorCount: number }
type SurvivorsCommand = RunOutcomeCommand & { readonly survivorsReason: 'no-report' | 'mismatch' }
type ClassedCommand = RunOutcomeCommand & { readonly highestExitClass: ExitClass }

const isSignaled = (command: RunOutcomeCommand): command is SignaledCommand => command.signal !== undefined
const isSucceeded = (command: RunOutcomeCommand): command is SucceededCommand => command.succeeded
const isHelpRun = (command: RunOutcomeCommand): command is HelpCommand => command.helpErrorCount !== undefined
const isSurvivorsRun = (command: RunOutcomeCommand): command is SurvivorsCommand =>
  command.survivorsReason !== undefined
const isHighestClassed = (command: RunOutcomeCommand): command is ClassedCommand =>
  command.highestExitClass !== undefined

const signaledOutcome = (command: SignaledCommand): RunOutcomeError =>
  RunInterrupted.make({ code: 128 + command.signal })

const succeededOutcome = (command: SucceededCommand): RunOutcomeDecision =>
  Option.match(Option.fromUndefinedOr(command.successExitClass), {
    onNone: () => RunOk.make({ help: false }),
    onSome: (exitClass) => RunFailed.make({ code: classCode(exitClass), diagnostic: command.diagnostic }),
  })

const helpOutcome = (command: HelpCommand): RunOutcomeDecision =>
  Match.value(command.helpErrorCount > 0).pipe(
    Match.when(true, () => RunParseFailed.make({ unrecognized: command.unrecognized })),
    Match.orElse(() => RunOk.make({ help: true })),
  )

const parseFailedOutcome = (command: RunOutcomeCommand): RunOutcomeDecision =>
  RunParseFailed.make({ unrecognized: command.unrecognized })

const survivorsRejectedOutcome = (command: SurvivorsCommand): RunOutcomeDecision =>
  RunSurvivorsRejected.make({
    reason: command.survivorsReason,
    diagnostic: command.survivorsDiagnostic,
  })

const configFailedOutcome = (command: RunOutcomeCommand): RunOutcomeDecision =>
  RunConfigFailed.make({ detail: command.configDetail })

const classedOutcome = (command: ClassedCommand): RunOutcomeDecision =>
  Match.value(command.highestExitClass).pipe(
    Match.when('ConfigError', () => RunConfigFailed.make({ detail: command.configDetail })),
    Match.orElse((exitClass) => RunFailed.make({ code: classCode(exitClass), diagnostic: command.diagnostic })),
  )

const genericFailureOutcome = (command: RunOutcomeCommand): RunOutcomeDecision =>
  RunFailed.make({ code: 1, diagnostic: command.diagnostic })

function classify(command: RunOutcomeCommand): RunOutcomeDecision | RunOutcomeError {
  return Match.value(command).pipe(
    Match.when(isSignaled, signaledOutcome),
    Match.when(isSucceeded, succeededOutcome),
    Match.when((interrupted): boolean => interrupted.interrupted, () => RunInterrupted.make({ code: 1 })),
    Match.when(isHelpRun, helpOutcome),
    Match.when((cliError): boolean => cliError.cliError, parseFailedOutcome),
    Match.when(isSurvivorsRun, survivorsRejectedOutcome),
    Match.when((schemaError): boolean => schemaError.schemaError, configFailedOutcome),
    Match.when(isHighestClassed, classedOutcome),
    Match.orElse(genericFailureOutcome),
  )
}

export const classifyRunOutcome = Workflow.make(
  RunOutcomeCommand,
  (command): Result.Result<RunOutcomeDecision, RunOutcomeError> =>
    Match.value(classify(command)).pipe(
      Match.tag('RunInterrupted', (error) => Result.fail(error)),
      Match.when(
        (outcome): outcome is RunOutcomeDecision => !(outcome instanceof RunInterrupted),
        (decision) => Result.succeed(decision),
      ),
      Match.exhaustive,
    ),
)
