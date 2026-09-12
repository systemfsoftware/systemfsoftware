import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

import { MutationTestCommand } from './MutationTest.schema.js'

export class MutationTestError extends S.TaggedError<MutationTestError>()('MutationTestError', {
  stage: S.Literal('mutationTest'),
  reason: S.String,
}) {}

const MutationTestDecisionTypeId: unique symbol = Symbol.for('@systemfsoftware/stryker-js-cli/run/MutationTestDecision')
type MutationTestDecisionTypeId = typeof MutationTestDecisionTypeId

export class MutationTestProceed extends S.TaggedClass<MutationTestProceed>()('MutationTestProceed', {}) {
  readonly [MutationTestDecisionTypeId] = MutationTestDecisionTypeId
}

export class MutationTestDryRunOnly extends S.TaggedClass<MutationTestDryRunOnly>()('MutationTestDryRunOnly', {}) {
  readonly [MutationTestDecisionTypeId] = MutationTestDecisionTypeId
}

export class MutationTestNoTests extends S.TaggedClass<MutationTestNoTests>()('MutationTestNoTests', {}) {
  readonly [MutationTestDecisionTypeId] = MutationTestDecisionTypeId
}

export type MutationTestDecision = MutationTestProceed | MutationTestDryRunOnly | MutationTestNoTests

const isInvalidTestCount = (command: MutationTestCommand): boolean => command.testCount < 0

export const admitMutationTest = Workflow.make(
  MutationTestCommand,
  (command: MutationTestCommand): Result.Result<MutationTestDecision, MutationTestError> =>
    Match.value(command).pipe(
      Match.when(isInvalidTestCount, () =>
        Result.fail(new MutationTestError({ stage: 'mutationTest', reason: 'Invalid test count' }))),
      Match.when({ dryRunOnly: true }, () =>
        Result.succeed(new MutationTestDryRunOnly({}))),
      Match.when(
        { isZero: true, allowEmpty: true },
        () => Result.succeed(new MutationTestNoTests({})),
      ),
      Match.orElse(() => Result.succeed(new MutationTestProceed({}))),
    ),
)
