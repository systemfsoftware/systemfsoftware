import * as S from 'effect/Schema'

export const AstFormat = S.Literals(['js', 'ts', 'tsx'])

export type AstFormat = typeof AstFormat.Type
