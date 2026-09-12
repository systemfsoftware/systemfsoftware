import type { Mutant } from '@systemfsoftware/stryker-js/Mutant'
import * as S from 'effect/Schema'

const PositionCodec = S.Struct({
  line: S.Finite,
  column: S.Finite,
})

const LocationCodec = S.Struct({
  start: PositionCodec,
  end: PositionCodec,
})

const MutantStatusCodec = S.Literals([
  'Killed',
  'Survived',
  'NoCoverage',
  'Timeout',
  'CompileError',
  'RuntimeError',
  'Ignored',
  'Pending',
])

export const MutantCodec: S.Codec<Mutant> = S.TaggedStruct('Mutant', {
  id: S.NonEmptyString,
  fileName: S.NonEmptyString,
  mutatorName: S.NonEmptyString,
  replacement: S.String,
  location: LocationCodec,
  status: S.optional(MutantStatusCodec),
  statusReason: S.optional(S.String),
  coveredBy: S.optional(S.Array(S.String)),
  static: S.optional(S.Boolean),
  testsCompleted: S.optional(S.Finite),
  description: S.optional(S.String),
})
