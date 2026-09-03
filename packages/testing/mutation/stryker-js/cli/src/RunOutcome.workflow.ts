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

function classify(command: RunOutcomeCommand): RunOutcomeDecision | RunOutcomeError {
  if (command.signal !== undefined) {
    return RunInterrupted.make({ code: 128 + command.signal })
  }
  if (command.succeeded) {
    if (command.successExitClass !== undefined) {
      return RunFailed.make({
        code: classCode(command.successExitClass),
        diagnostic: command.diagnostic,
      })
    }
    return RunOk.make({ help: false })
  }
  if (command.interrupted) {
    return RunInterrupted.make({ code: 1 })
  }
  if (command.helpErrorCount !== undefined) {
    if (command.helpErrorCount > 0) {
      return RunParseFailed.make({ unrecognized: command.unrecognized })
    }
    return RunOk.make({ help: true })
  }
  if (command.cliError) {
    return RunParseFailed.make({ unrecognized: command.unrecognized })
  }
  if (command.survivorsReason !== undefined) {
    return RunSurvivorsRejected.make({
      reason: command.survivorsReason,
      diagnostic: command.survivorsDiagnostic,
    })
  }
  if (command.schemaError) {
    return RunConfigFailed.make({ detail: command.configDetail })
  }
  if (command.highestExitClass !== undefined) {
    if (command.highestExitClass === 'ConfigError') {
      return RunConfigFailed.make({ detail: command.configDetail })
    }
    return RunFailed.make({
      code: classCode(command.highestExitClass),
      diagnostic: command.diagnostic,
    })
  }
  return RunFailed.make({ code: 1, diagnostic: command.diagnostic })
}

function succeedOutcome(decision: RunOutcomeDecision): Result.Result<RunOutcomeDecision, RunOutcomeError> {
  return Result.succeed(decision)
}

function failOutcome(error: RunOutcomeError): Result.Result<RunOutcomeDecision, RunOutcomeError> {
  return Result.fail(error)
}

function runOutcomeDecision(
  command: RunOutcomeCommand,
): Result.Result<RunOutcomeDecision, RunOutcomeError> {
  return Match.value(classify(command)).pipe(
    Match.tag('RunOk', succeedOutcome),
    Match.tag('RunParseFailed', succeedOutcome),
    Match.tag('RunSurvivorsRejected', succeedOutcome),
    Match.tag('RunConfigFailed', succeedOutcome),
    Match.tag('RunFailed', succeedOutcome),
    Match.tag('RunInterrupted', failOutcome),
    Match.exhaustive,
  )
}

export const runOutcomeWorkflow = Workflow.make(RunOutcomeCommand, runOutcomeDecision)
