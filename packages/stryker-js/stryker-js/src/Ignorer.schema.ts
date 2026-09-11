import * as S from 'effect/Schema'

import type { StandardSchemaV1 } from './Plugin.schema.js'

export const IgnoreDecisionCodec = S.NullOr(S.String)
export type IgnoreDecision = S.Schema.Type<typeof IgnoreDecisionCodec>

export const IgnoreDecisionSchema: StandardSchemaV1<unknown, IgnoreDecision> = S.toStandardSchemaV1(
  IgnoreDecisionCodec,
)
