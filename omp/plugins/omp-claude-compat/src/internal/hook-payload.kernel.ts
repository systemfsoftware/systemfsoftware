import { Schema as S } from 'effect'

export const EMPTY_TOOL_INPUT: Record<string, unknown> = {}

export const ToolInputRecord = S.Record(S.String, S.Unknown)

export const asToolInput = S.decodeUnknownOption(ToolInputRecord)
