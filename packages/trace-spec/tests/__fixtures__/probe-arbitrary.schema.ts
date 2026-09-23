import { Schema as S } from 'effect'

export const probeInputs = S.Array(S.Int.pipe(S.check(S.isBetween({ minimum: 0, maximum: 12 }))))

export const singleProbeInputs = S.Int.pipe(S.check(S.isBetween({ minimum: 0, maximum: 12 })))
