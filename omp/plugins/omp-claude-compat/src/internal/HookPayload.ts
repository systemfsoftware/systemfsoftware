import { Schema as S } from 'effect'
import { ToolInputRecord } from './HookPayload.schema.js'

/** @internal */
export const EMPTY_TOOL_INPUT: Record<string, unknown> = {}

/** @internal */
export const asToolInput = S.decodeUnknownOption(ToolInputRecord)
