import { Schema } from 'effect'

export const ConfirmationClaims = Schema.Struct({
  tool: Schema.String,
  digest: Schema.String,
  subject: Schema.String,
  expiresAt: Schema.Finite,
})
export type ConfirmationClaims = typeof ConfirmationClaims.Type

export const ConfirmationClaimsJson = Schema.fromJsonString(ConfirmationClaims)

export class InvalidRequestState extends Schema.TaggedError<InvalidRequestState>()('InvalidRequestState', {
  reason: Schema.String,
}) {
  override get message(): string {
    return `the confirmation request state is not valid: ${this.reason}`
  }
}
