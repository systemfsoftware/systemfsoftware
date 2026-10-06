import { Schema } from 'effect'
import { Person } from './principal.schema.js'

export class TokenMissing extends Schema.TaggedClass<TokenMissing>()('TokenMissing', {}) {}

export class TokenVerified extends Schema.TaggedClass<TokenVerified>()('TokenVerified', {
  principal: Person,
}) {}

export class AudienceMismatch extends Schema.TaggedClass<AudienceMismatch>()('AudienceMismatch', {}) {}

export class IssuerMismatch extends Schema.TaggedClass<IssuerMismatch>()('IssuerMismatch', {}) {}

export class TokenExpired extends Schema.TaggedClass<TokenExpired>()('TokenExpired', {}) {}

export class SignatureInvalid extends Schema.TaggedClass<SignatureInvalid>()('SignatureInvalid', {}) {}

export class UnsupportedAlgorithm extends Schema.TaggedClass<UnsupportedAlgorithm>()('UnsupportedAlgorithm', {}) {}

export class MalformedToken extends Schema.TaggedClass<MalformedToken>()('MalformedToken', {}) {}

export const TokenVerdict = Schema.Union([
  TokenMissing,
  TokenVerified,
  AudienceMismatch,
  IssuerMismatch,
  TokenExpired,
  SignatureInvalid,
  UnsupportedAlgorithm,
  MalformedToken,
])
export type TokenVerdict = typeof TokenVerdict.Type

export class TokenVerificationFailed extends Schema.TaggedError<TokenVerificationFailed>()('TokenVerificationFailed', {
  cause: Schema.optional(Schema.Unknown),
}) {
  override get message(): string {
    return 'the token could not be verified against the authorization server'
  }
}
