import * as S from 'effect/Schema'

import { LocationSchema, MutantStatusSchema } from './Report.schema.js'

export class Mutant extends S.TaggedClass<Mutant>()('Mutant', {
  id: S.NonEmptyString,
  fileName: S.NonEmptyString,
  mutatorName: S.NonEmptyString,
  replacement: S.String,
  location: LocationSchema,
  status: S.optional(MutantStatusSchema),
  statusReason: S.optional(S.String),
  coveredBy: S.optional(S.Array(S.String)),
  static: S.optional(S.Boolean),
  testsCompleted: S.optional(S.Finite),
  description: S.optional(S.String),
}) {}
