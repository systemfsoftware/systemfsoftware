import { Schema as S } from 'effect'

export const NodePhase = S.Literals(['uninitialized', 'stale', 'checking', 'valid', 'removed'])
export type NodePhase = S.Schema.Type<typeof NodePhase>
