import * as S from 'effect/Schema'

import { ExitClassCodec } from './ExitClass.schema.js'
import type { StandardSchemaV1 } from './Plugin.schema.js'

const EvaluatorVerdictCodec = S.NullOr(
  S.Struct({
    exitClass: ExitClassCodec,
    message: S.optional(S.String),
  }),
)
export type EvaluatorVerdict = S.Schema.Type<typeof EvaluatorVerdictCodec>

export const EvaluatorVerdictSchema: StandardSchemaV1<unknown, EvaluatorVerdict> = S.toStandardSchemaV1(
  EvaluatorVerdictCodec,
)

const EvaluatorFailedCodec = S.TaggedStruct('EvaluatorFailed', {
  cause: S.String,
  evaluatorName: S.String,
})
export type EvaluatorFailed = S.Schema.Type<typeof EvaluatorFailedCodec>

export const EvaluatorFailedSchema: StandardSchemaV1<unknown, EvaluatorFailed> = S.toStandardSchemaV1(
  EvaluatorFailedCodec,
)
