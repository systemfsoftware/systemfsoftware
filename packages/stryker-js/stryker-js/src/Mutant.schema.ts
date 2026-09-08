import * as S from 'effect/Schema'

export const MutantId = S.NonEmptyString.pipe(S.brand('MutantId'))
export type MutantId = typeof MutantId.Type

export const TestId = S.NonEmptyString.pipe(S.brand('TestId'))
export type TestId = typeof TestId.Type

export const FileName = S.NonEmptyString.pipe(S.brand('FileName'))
export type FileName = typeof FileName.Type

export const DirectoryPath = S.NonEmptyString.pipe(S.brand('DirectoryPath'))
export type DirectoryPath = typeof DirectoryPath.Type

export const MutatorName = S.NonEmptyString.pipe(S.brand('MutatorName'))
export type MutatorName = typeof MutatorName.Type

export const PositionSchema = S.Struct({
  line: S.Finite,
  column: S.Finite,
})

export const LocationSchema = S.Struct({
  start: PositionSchema,
  end: PositionSchema,
})

export class Mutant extends S.TaggedClass<Mutant>()('Mutant', {
  id: MutantId,
  fileName: FileName,
  mutatorName: MutatorName,
  replacement: S.String,
  location: LocationSchema,
  status: S.optional(
    S.Literals(['Killed', 'Survived', 'NoCoverage', 'Timeout', 'CompileError', 'RuntimeError', 'Ignored', 'Pending']),
  ),
  statusReason: S.optional(S.String),
  coveredBy: S.optional(S.Array(TestId)),
  static: S.optional(S.Boolean),
  testsCompleted: S.optional(S.Finite),
  description: S.optional(S.String),
}) {}

export type Position = S.Schema.Type<typeof PositionSchema>

export type Location = S.Schema.Type<typeof LocationSchema>
