import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

import { MutationTestCommand } from './MutationTest.schema.js'

export class MutationTestError extends S.TaggedError<MutationTestError>()('MutationTestError', {
  stage: S.Literal('mutationTest'),
  reason: S.String,
}) {}

export class MutationTestDecision extends S.TaggedClass<MutationTestDecision>()('MutationTestDecision', {
  kind: S.Literals(['Proceed', 'Skipped']),
  reason: S.optional(S.String),
}) {}

const toKind = (command: MutationTestCommand): 'DryRunOnly' | 'NoTests' | 'Proceed' => {
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
  (command: MutationTestCommand): Result.Result<MutationTestDecision, MutationTestError> => {
    if (command.testCount < 0) {
      return Result.fail(new MutationTestError({ stage: 'mutationTest', reason: 'Invalid test count' }))
    }
    return Match.value(toKind(command)).pipe(
      Match.when(
        'DryRunOnly',
        () => Result.succeed(new MutationTestDecision({ kind: 'Skipped', reason: 'dryRunOnly' })),
      ),
      Match.when(
        'NoTests',
        () => Result.succeed(new MutationTestDecision({ kind: 'Skipped', reason: 'noTestsAllowEmpty' })),
      ),
      Match.when('Proceed', () => Result.succeed(new MutationTestDecision({ kind: 'Proceed' }))),
      Match.exhaustive,
    )
  },
)
