import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

import { MutationTestCommand } from './MutationTest.schema.js'

export class MutationTestError extends S.TaggedError<MutationTestError>()('MutationTestError', {
  stage: S.Literal('mutationTest'),
  reason: S.String,
}) {}

const MutationTestDecisionTypeId: unique symbol = Symbol.for('@systemfsoftware/stryker-js-engine/MutationTestDecision')
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

const toKind = (command: MutationTestCommand): 'Invalid' | 'DryRunOnly' | 'NoTests' | 'Proceed' => {
  if (command.testCount < 0) {
    return 'Invalid'
  }
  if (command.dryRunOnly) {
    return 'DryRunOnly'
  }
  if (command.isZero && command.allowEmpty) {
    return 'NoTests'
  }
  return 'Proceed'
}

export const admitMutationTest = Workflow.make(
  MutationTestCommand,
  (command: MutationTestCommand): Result.Result<MutationTestDecision, MutationTestError> =>
    Match.value(toKind(command)).pipe(
      Match.when(
        'Invalid',
        () => Result.fail(new MutationTestError({ stage: 'mutationTest', reason: 'Invalid test count' })),
      ),
      Match.when('DryRunOnly', () => Result.succeed(new MutationTestDryRunOnly({}))),
      Match.when('NoTests', () => Result.succeed(new MutationTestNoTests({}))),
      Match.when('Proceed', () => Result.succeed(new MutationTestProceed({}))),
      Match.exhaustive,
    ),
)
