import { Schema } from 'effect'

export const ActionsOidcTokenResponse = Schema.Struct({
  value: Schema.optional(Schema.RedactedFromValue(Schema.NonEmptyString)),
})
export type ActionsOidcTokenResponse = typeof ActionsOidcTokenResponse.Type

export const DopplerOidcTokenResponse = Schema.Struct({
  token: Schema.RedactedFromValue(Schema.NonEmptyString),
  expires_at: Schema.String,
})
export type DopplerOidcTokenResponse = typeof DopplerOidcTokenResponse.Type
