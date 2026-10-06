import { Schema } from 'effect'

const AuthorizationVerdictTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/effect-contract/AuthorizationVerdict',
)
type AuthorizationVerdictTypeId = typeof AuthorizationVerdictTypeId

export class Admit extends Schema.TaggedClass<Admit>()('Admit', {}) {
  readonly [AuthorizationVerdictTypeId] = AuthorizationVerdictTypeId
}

export class Unauthenticated extends Schema.TaggedClass<Unauthenticated>()('Unauthenticated', {}) {
  readonly [AuthorizationVerdictTypeId] = AuthorizationVerdictTypeId
}

export class Forbidden extends Schema.TaggedClass<Forbidden>()('Forbidden', {}) {
  readonly [AuthorizationVerdictTypeId] = AuthorizationVerdictTypeId
}

export const AuthorizationVerdict = Schema.Union([Admit, Unauthenticated, Forbidden])
export type AuthorizationVerdict = typeof AuthorizationVerdict.Type
