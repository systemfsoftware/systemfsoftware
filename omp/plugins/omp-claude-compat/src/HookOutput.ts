import { Schema as S } from 'effect'
import { HookOutputFromStdout } from './HookOutput.schema.js'

export type { ParsedHookOutput } from './HookOutput.schema.js'

export const parseHookOutput = S.decodeUnknownExit(HookOutputFromStdout)
