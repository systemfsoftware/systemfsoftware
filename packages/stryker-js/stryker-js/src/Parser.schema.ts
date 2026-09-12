import * as S from 'effect/Schema'

import type { StandardSchemaV1 } from './Plugin.schema.js'

const ParserPayloadCodec = S.Struct({
  extensions: S.NonEmptyArray(S.NonEmptyString),
})
export type ParserPayload = S.Schema.Type<typeof ParserPayloadCodec>

export const ParserPayloadSchema: StandardSchemaV1<unknown, ParserPayload> = S.toStandardSchemaV1(
  ParserPayloadCodec,
)
