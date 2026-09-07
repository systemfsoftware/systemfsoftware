import * as S from 'effect/Schema'

const ReplacementTextSchema = S.String.pipe(S.brand('ReplacementText'))
const SourceTextSchema = S.String.pipe(S.brand('SourceText'))
const PositionSchema = S.Struct({ line: S.Finite, column: S.Finite })
const PreviousLocationSchema = S.Struct({ start: PositionSchema, end: PositionSchema })

const PreviousMutantSchema = S.Struct({
  mutatorName: S.NonEmptyString,
  replacement: ReplacementTextSchema,
  location: PreviousLocationSchema,
  status: S.Literals([
    'Killed',
    'Survived',
    'NoCoverage',
    'Timeout',
    'CompileError',
    'RuntimeError',
    'Ignored',
    'Pending',
  ]),
  testsCompleted: S.optional(S.Finite),
  coveredBy: S.optional(S.Array(S.String)),
  killedBy: S.optional(S.Array(S.String)),
})

const PreviousFileSchema = S.Struct({
  source: S.optional(SourceTextSchema),
  mutants: S.optional(S.Array(PreviousMutantSchema)),
})

const PreviousTestFileSchema = S.Struct({
  source: S.optional(SourceTextSchema),
})

export const PreviousFilesSchema = S.Record(S.String, PreviousFileSchema)
export const PreviousTestFilesSchema = S.Record(S.String, PreviousTestFileSchema)

export type PreviousFileRecord = S.Schema.Type<typeof PreviousFileSchema>
export type PreviousTestFileRecord = S.Schema.Type<typeof PreviousTestFileSchema>
export type PreviousMutantRecord = S.Schema.Type<typeof PreviousMutantSchema>
