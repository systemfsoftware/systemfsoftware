import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

export class DryRunError extends S.TaggedError<DryRunError>()('DryRunError', {
  stage: S.Literals(['dryRun', 'dryRunNoTests']),
  reason: S.String,
}) {}

export class DryRunCommand extends S.TaggedClass<DryRunCommand>()('DryRunCommand', {
  status: S.Literals(['Complete', 'Error', 'Timeout']),
  testCount: S.Finite,
  failedTestCount: S.Finite,
  allowEmpty: S.Boolean,
  errorMessage: S.optional(S.String),
  reason: S.optional(S.String),
  failedTests: S.optional(S.Array(S.String)),
}) {}

export class DryRunDecision extends S.TaggedClass<DryRunDecision>()('DryRunDecision', {
  testCount: S.Finite,
  failedTestCount: S.Finite,
}) {}

const decideComplete = (command: DryRunCommand): Result.Result<DryRunDecision, DryRunError> => {
  if (command.testCount === 0 && command.allowEmpty === false) {
    return Result.fail(
      new DryRunError({
        stage: 'dryRunNoTests',
        reason: 'No tests were executed. Stryker will exit prematurely. Please check your configuration.',
      }),
    )
  }
  if (command.failedTestCount > 0) {
    return Result.fail(
      new DryRunError({
        stage: 'dryRun',
        reason: [
          `There were failed tests in the initial test run (${command.failedTestCount} of ${command.testCount}):`,
          ...(command.failedTests ?? ['(failed test names unavailable)']),
        ].join('\n'),
      }),
    )
  }
  return Result.succeed(
    new DryRunDecision({
      testCount: command.testCount,
      failedTestCount: command.failedTestCount,
    }),
  )
}

export const dryRunWorkflow = Workflow.make(
  DryRunCommand,
  (command: DryRunCommand): Result.Result<DryRunDecision, DryRunError> =>
    Match.value(command.status).pipe(
      Match.when('Error', () =>
        Result.fail(
          new DryRunError({
            stage: 'dryRun',
            reason: command.errorMessage ?? 'Dry run error',
          }),
        )),
      Match.when('Timeout', () =>
        Result.fail(
          new DryRunError({
            stage: 'dryRun',
            reason: command.reason ?? 'Initial test run timed out',
          }),
        )),
      Match.when('Complete', () => decideComplete(command)),
      Match.exhaustive,
    ),
)
