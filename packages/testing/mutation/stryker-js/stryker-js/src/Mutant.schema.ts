import * as S from 'effect/Schema'

export const PositionSchema = S.Struct({
  line: S.Finite,
  column: S.Finite,
})

export const LocationSchema = S.Struct({
  start: PositionSchema,
  end: PositionSchema,
})

export class Mutant extends S.TaggedClass<Mutant>()('Mutant', {
  id: S.String,
  fileName: S.String,
  mutatorName: S.String,
  replacement: S.String,
  location: LocationSchema,
  status: S.optional(
    S.Literals(['Killed', 'Survived', 'NoCoverage', 'Timeout', 'CompileError', 'RuntimeError', 'Ignored', 'Pending']),
  ),
  statusReason: S.optional(S.String),
  coveredBy: S.optional(S.Array(S.String)),
  static: S.optional(S.Boolean),
  testsCompleted: S.optional(S.Finite),
  description: S.optional(S.String),
}) {}

export type Position = S.Schema.Type<typeof PositionSchema>

export type Location = S.Schema.Type<typeof LocationSchema>
