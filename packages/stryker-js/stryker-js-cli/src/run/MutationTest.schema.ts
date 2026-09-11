import * as S from 'effect/Schema'

export class MutationTestCommand extends S.TaggedClass<MutationTestCommand>()('MutationTestCommand', {
  dryRunOnly: S.Boolean,
  allowEmpty: S.Boolean,
  testCount: S.Finite,
  isZero: S.Boolean,
}) {}
