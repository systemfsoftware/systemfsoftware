import * as S from 'effect/Schema'

import type { StandardSchemaV1 } from './Plugin.schema.js'

export const PositionCodec = S.Struct({
  line: S.Finite,
  column: S.Finite,
})
export type Position = S.Schema.Type<typeof PositionCodec>

export const PositionSchema: StandardSchemaV1<unknown, Position> = S.toStandardSchemaV1(PositionCodec)

export const LocationCodec = S.Struct({
  start: PositionCodec,
  end: PositionCodec,
})
export type Location = S.Schema.Type<typeof LocationCodec>

export const LocationSchema: StandardSchemaV1<unknown, Location> = S.toStandardSchemaV1(LocationCodec)

export const MutantStatusCodec = S.Literals([
  'Killed',
  'Survived',
  'NoCoverage',
  'Timeout',
  'CompileError',
  'RuntimeError',
  'Ignored',
  'Pending',
])
export type MutantStatus = S.Schema.Type<typeof MutantStatusCodec>

export const MutantStatusSchema: StandardSchemaV1<unknown, MutantStatus> = S.toStandardSchemaV1(MutantStatusCodec)

export const MutantCodec = S.TaggedStruct('Mutant', {
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
export type Mutant = S.Schema.Type<typeof MutantCodec>

export const MutantSchema: StandardSchemaV1<unknown, Mutant> = S.toStandardSchemaV1(MutantCodec)
