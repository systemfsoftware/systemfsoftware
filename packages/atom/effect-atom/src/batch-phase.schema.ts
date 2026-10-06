import { Schema as S } from 'effect'

export const BatchPhaseName = S.Literals(['disabled', 'collect', 'commit'])
export type BatchPhaseName = typeof BatchPhaseName.Type
