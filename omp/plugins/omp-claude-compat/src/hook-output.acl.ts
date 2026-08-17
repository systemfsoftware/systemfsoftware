import { Schema as S } from 'effect'
import { HookOutputFromStdout } from './hook-output.schema.js'

export type { ParsedHookOutput } from './hook-output.schema.js'

export const parseHookOutput = S.decodeUnknownExit(HookOutputFromStdout)
