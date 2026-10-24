import { Schema } from 'effect'
import { PrivateKeyPem } from './AppJwt.schema.js'

const DecimalId = Schema.String.pipe(Schema.check(Schema.isPattern(/^[1-9][0-9]*$/)))

export const AppCredentials = Schema.Struct({
  KIRO_APP_ID: DecimalId,
  KIRO_APP_INSTALLATION_ID: DecimalId,
  KIRO_APP_PRIVATE_KEY: Schema.RedactedFromValue(PrivateKeyPem),
})
export type AppCredentials = typeof AppCredentials.Type

export const InstallationTokenResponse = Schema.Struct({
  token: Schema.RedactedFromValue(Schema.NonEmptyString),
  expires_at: Schema.String,
  permissions: Schema.Record(Schema.String, Schema.String),
  repository_selection: Schema.String,
})
export type InstallationTokenResponse = typeof InstallationTokenResponse.Type

export const MintedToken = Schema.Struct({
  token: Schema.Redacted(Schema.String),
  expiresAt: Schema.String,
  permissions: Schema.Record(Schema.String, Schema.String),
  repositorySelection: Schema.String,
})
export type MintedToken = typeof MintedToken.Type

export const mintedTokenOf = (response: InstallationTokenResponse): MintedToken => ({
  token: response.token,
  expiresAt: response.expires_at,
  permissions: response.permissions,
  repositorySelection: response.repository_selection,
})
