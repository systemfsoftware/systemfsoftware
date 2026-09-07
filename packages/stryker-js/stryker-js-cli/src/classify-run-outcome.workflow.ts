import { Workflow } from '@systemfsoftware/effect-cell-types'
import { ExitClass } from '@systemfsoftware/stryker-js/ExitClass'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

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
  successExitClass: S.optional(ExitClass),
  highestExitClass: S.optional(ExitClass),
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

type RunOutcomeKind =
  | 'Signaled'
  | 'SucceededWithClass'
  | 'SucceededClean'
  | 'InterruptedFlag'
  | 'ParseFailed'
  | 'HelpOk'
  | 'Survivors'
  | 'ConfigDetail'
  | 'HighestOther'
  | 'Fallback'

const OUTCOME_RULES: ReadonlyArray<{
  readonly kind: RunOutcomeKind
  readonly matches: (command: RunOutcomeCommand) => boolean
}> = [
  { kind: 'Signaled', matches: (command) => command.signal !== undefined },
  { kind: 'SucceededWithClass', matches: (command) => command.succeeded && command.successExitClass !== undefined },
  { kind: 'SucceededClean', matches: (command) => command.succeeded },
  { kind: 'InterruptedFlag', matches: (command) => command.interrupted },
  { kind: 'ParseFailed', matches: (command) => command.helpErrorCount !== undefined && command.helpErrorCount > 0 },
  { kind: 'HelpOk', matches: (command) => command.helpErrorCount !== undefined },
  { kind: 'ParseFailed', matches: (command) => command.cliError },
  { kind: 'Survivors', matches: (command) => command.survivorsReason !== undefined },
  { kind: 'ConfigDetail', matches: (command) => command.schemaError },
  { kind: 'ConfigDetail', matches: (command) => command.highestExitClass === 'ConfigError' },
  { kind: 'HighestOther', matches: (command) => command.highestExitClass !== undefined },
]

const toKind = (command: RunOutcomeCommand): RunOutcomeKind =>
  OUTCOME_RULES.find((rule) => rule.matches(command))?.kind ?? 'Fallback'

export const classifyRunOutcome = Workflow.make(
  RunOutcomeCommand,
  // The `??` fallbacks below are totality witnesses, not live defaults: each
  // kind reaches its arm only when the classifier saw the field defined.
  (command: RunOutcomeCommand): Result.Result<RunOutcomeDecision, RunOutcomeError> =>
    Match.value(toKind(command)).pipe(
      Match.when('Signaled', () => Result.fail(RunInterrupted.make({ code: 128 + (command.signal ?? 0) }))),
      Match.when('SucceededWithClass', () =>
        Result.succeed(
          RunFailed.make({
            code: classCode(command.successExitClass ?? 'VerdictFail'),
            diagnostic: command.diagnostic,
          }),
        )),
      Match.when('SucceededClean', () => Result.succeed(RunOk.make({ help: false }))),
      Match.when('InterruptedFlag', () => Result.fail(RunInterrupted.make({ code: 1 }))),
      Match.when('ParseFailed', () => Result.succeed(RunParseFailed.make({ unrecognized: command.unrecognized }))),
      Match.when('HelpOk', () => Result.succeed(RunOk.make({ help: true }))),
      Match.when('Survivors', () =>
        Result.succeed(
          RunSurvivorsRejected.make({
            reason: command.survivorsReason ?? 'no-report',
            diagnostic: command.survivorsDiagnostic,
          }),
        )),
      Match.when('ConfigDetail', () => Result.succeed(RunConfigFailed.make({ detail: command.configDetail }))),
      Match.when('HighestOther', () =>
        Result.succeed(
          RunFailed.make({
            code: classCode(command.highestExitClass ?? 'VerdictFail'),
            diagnostic: command.diagnostic,
          }),
        )),
      Match.when('Fallback', () => Result.succeed(RunFailed.make({ code: 1, diagnostic: command.diagnostic }))),
      Match.exhaustive,
    ),
)
