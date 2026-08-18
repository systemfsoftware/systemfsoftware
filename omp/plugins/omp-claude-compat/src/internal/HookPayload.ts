import { Schema as S } from 'effect'
import { ToolInputRecord } from './HookPayload.schema.js'

export const EMPTY_TOOL_INPUT: Record<string, unknown> = {}

export const asToolInput = S.decodeUnknownOption(ToolInputRecord)
