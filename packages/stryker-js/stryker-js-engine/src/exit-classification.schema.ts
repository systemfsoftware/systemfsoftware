import * as S from 'effect/Schema'

export const ExitClass = S.Literals(['VerdictFail', 'ConfigError', 'RuntimeError', 'InternalError'])

export type ExitClass = typeof ExitClass.Type
