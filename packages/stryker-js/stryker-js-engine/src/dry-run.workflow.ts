import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
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
}) {}

const DryRunDecisionTypeId: unique symbol = Symbol.for('@systemfsoftware/stryker-js-engine/DryRunDecision')
type DryRunDecisionTypeId = typeof DryRunDecisionTypeId

export class DryRunPassed extends S.TaggedClass<DryRunPassed>()('DryRunPassed', {
  testCount: S.Finite,
}) {
  readonly [DryRunDecisionTypeId] = DryRunDecisionTypeId
}

export class DryRunFailed extends S.TaggedClass<DryRunFailed>()('DryRunFailed', {
  testCount: S.Finite,
  failedTestCount: S.Finite,
}) {
  readonly [DryRunDecisionTypeId] = DryRunDecisionTypeId
}

export type DryRunDecision = DryRunPassed | DryRunFailed

const reasonOrDefault = (reason: string | undefined, fallback: string): string =>
  Option.getOrElse(() => fallback)(Option.fromUndefinedOr(reason))

const hasFailedTests = (command: DryRunCommand): boolean => command.failedTestCount > 0

const decideComplete = (command: DryRunCommand): Result.Result<DryRunDecision, DryRunError> =>
  Match.value(command).pipe(
    Match.when({ testCount: 0, allowEmpty: false }, () =>
      Result.fail(
        new DryRunError({
          stage: 'dryRunNoTests',
          reason: 'No tests were executed. Stryker will exit prematurely. Please check your configuration.',
        }),
      )),
    Match.when(hasFailedTests, () =>
      Result.succeed(
        new DryRunFailed({
          testCount: command.testCount,
          failedTestCount: command.failedTestCount,
        }),
      )),
    Match.orElse(() =>
      Result.succeed(
        new DryRunPassed({
          testCount: command.testCount,
        }),
      )
    ),
  )

export const dryRun = Workflow.make(
  DryRunCommand,
  (command: DryRunCommand): Result.Result<DryRunDecision, DryRunError> =>
    Match.value(command.status).pipe(
      Match.when('Error', () =>
        Result.fail(
          new DryRunError({
            stage: 'dryRun',
            reason: reasonOrDefault(command.errorMessage, 'Dry run error'),
          }),
        )),
      Match.when('Timeout', () =>
        Result.fail(
          new DryRunError({
            stage: 'dryRun',
            reason: reasonOrDefault(command.reason, 'Initial test run timed out'),
          }),
        )),
      Match.when('Complete', () => decideComplete(command)),
      Match.exhaustive,
    ),
)
