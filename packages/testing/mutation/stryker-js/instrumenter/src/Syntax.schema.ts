import * as S from 'effect/Schema'

export const AstFormat = S.Literals(['html', 'js', 'ts', 'tsx', 'svelte'])

export type AstFormat = typeof AstFormat.Type
