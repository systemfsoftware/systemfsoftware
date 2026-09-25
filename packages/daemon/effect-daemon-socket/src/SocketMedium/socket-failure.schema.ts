import { Schema as S } from 'effect'

export const SocketOsError = S.Struct({
  code: S.optional(S.String),
  errno: S.optional(S.Int),
})
export type SocketOsError = typeof SocketOsError.Type
