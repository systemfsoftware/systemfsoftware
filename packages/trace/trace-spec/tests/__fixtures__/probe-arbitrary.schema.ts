import { Schema as S } from 'effect'

export const singleProbeInputs = S.Int.pipe(S.check(S.isBetween({ minimum: 0, maximum: 12 })))
