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

export class RunOk extends S.TaggedClass<RunOk>()('RunOk', {
  help: S.Boolean,
}) {}

export class RunInterrupted extends S.TaggedError<RunInterrupted>()('RunInterrupted', {
  code: S.Finite,
}) {}

export class RunParseFailed extends S.TaggedError<RunParseFailed>()('RunParseFailed', {
  unrecognized: S.optional(S.String),
}) {}

export class RunSurvivorsRejected extends S.TaggedError<RunSurvivorsRejected>()('RunSurvivorsRejected', {
  reason: S.Literals(['no-report', 'mismatch']),
  diagnostic: S.optional(S.String),
}) {}

export class RunConfigFailed extends S.TaggedError<RunConfigFailed>()('RunConfigFailed', {
  detail: S.optional(S.String),
}) {}

export class RunFailed extends S.TaggedError<RunFailed>()('RunFailed', {
  code: S.Finite,
  diagnostic: S.optional(S.String),
}) {}

export type RunOutcomeError =
  | RunInterrupted
  | RunParseFailed
  | RunSurvivorsRejected
  | RunConfigFailed
  | RunFailed

function classify(
  command: RunOutcomeCommand,
): RunOk | RunInterrupted | RunParseFailed | RunSurvivorsRejected | RunConfigFailed | RunFailed {
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

export function runOutcomeDecision(
  command: RunOutcomeCommand,
): Result.Result<RunOk, RunOutcomeError> {
  return Match.value(classify(command)).pipe(
    Match.tag('RunOk', (ok) => Result.succeed(ok)),
    Match.tag('RunInterrupted', (error) => Result.fail(error)),
    Match.tag('RunParseFailed', (error) => Result.fail(error)),
    Match.tag('RunSurvivorsRejected', (error) => Result.fail(error)),
    Match.tag('RunConfigFailed', (error) => Result.fail(error)),
    Match.tag('RunFailed', (error) => Result.fail(error)),
    Match.exhaustive,
  )
}

export const runOutcomeCode = (result: Result.Result<RunOk, RunOutcomeError>): number => {
  if (Result.isSuccess(result)) {
    return 0
  }
  return Match.value(result.failure).pipe(
    Match.tag('RunInterrupted', (error) => error.code),
    Match.tag('RunParseFailed', () => CONFIG_CODE),
    Match.tag('RunSurvivorsRejected', () => CONFIG_CODE),
    Match.tag('RunConfigFailed', () => CONFIG_CODE),
    Match.tag('RunFailed', (error) => error.code),
    Match.exhaustive,
  )
}

export const runOutcomeWorkflow = Workflow.make(RunOutcomeCommand, runOutcomeDecision)
