import * as S from 'effect/Schema'

import type { StandardSchemaV1 } from './Plugin.schema.js'

export const CheckStatusCodec = S.Literals(['passed', 'compileError'])
export type CheckStatus = S.Schema.Type<typeof CheckStatusCodec>

export const CheckStatusSchema: StandardSchemaV1<unknown, CheckStatus> = S.toStandardSchemaV1(CheckStatusCodec)

const PassedCheckResultCodec = S.Struct({ status: S.Literal('passed') })
export type PassedCheckResult = S.Schema.Type<typeof PassedCheckResultCodec>

const FailedCheckResultCodec = S.Struct({ status: S.Literal('compileError'), reason: S.String })
export type FailedCheckResult = S.Schema.Type<typeof FailedCheckResultCodec>

const CheckResultCodec = S.Union([PassedCheckResultCodec, FailedCheckResultCodec])
export type CheckResult = S.Schema.Type<typeof CheckResultCodec>

export const CheckResultSchema: StandardSchemaV1<unknown, CheckResult> = S.toStandardSchemaV1(CheckResultCodec)

const CheckerFailedCodec = S.TaggedStruct('CheckerFailed', {
  cause: S.String,
  checkerName: S.String,
  mutantIds: S.Array(S.String),
})
export type CheckerFailed = S.Schema.Type<typeof CheckerFailedCodec>

export const CheckerFailedSchema: StandardSchemaV1<unknown, CheckerFailed> = S.toStandardSchemaV1(CheckerFailedCodec)
