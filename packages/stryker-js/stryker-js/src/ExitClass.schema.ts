import * as S from 'effect/Schema'

import type { ClassifyExitCommand, ClassifyExitDecision, ExitClass } from './ExitClass.js'
import type { StandardSchemaV1 } from './Plugin.schema.js'

const EXIT_CLASSES: readonly ExitClass[] = ['VerdictFail', 'ConfigError', 'RuntimeError', 'InternalError']

export const ExitClassCodec = S.Literals(EXIT_CLASSES)

export const ExitClassSchema: StandardSchemaV1<unknown, ExitClass> = S.toStandardSchemaV1(ExitClassCodec)

export const ClassifyExitCommandSchema: StandardSchemaV1<unknown, ClassifyExitCommand> = S.toStandardSchemaV1(
  S.Struct({
    pending: S.Array(ExitClassCodec),
    signal: S.NullOr(S.Number),
    score: S.NullOr(S.Number),
    breakingThreshold: S.NullOr(S.Number),
  }),
)

export const ClassifyExitDecisionSchema: StandardSchemaV1<unknown, ClassifyExitDecision> = S.toStandardSchemaV1(
  S.Struct({
    highestClass: S.NullOr(ExitClassCodec),
    verdictClass: S.NullOr(ExitClassCodec),
  }),
)
