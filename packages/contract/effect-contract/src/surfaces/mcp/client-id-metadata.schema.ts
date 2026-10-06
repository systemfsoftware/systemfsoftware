import { Schema } from 'effect'

export const ClientIdUrl = Schema.String.pipe(
  Schema.check(Schema.isPattern(/^https:\/\/[^/?#@]+[^\s#]*$/)),
  Schema.brand('ClientIdUrl'),
)
export type ClientIdUrl = typeof ClientIdUrl.Type

export class ClientIdMetadata extends Schema.Class<ClientIdMetadata>(
  '@systemfsoftware/effect-contract/mcp/ClientIdMetadata',
)({
  client_id: ClientIdUrl,
  redirect_uris: Schema.Array(Schema.String),
  client_name: Schema.optional(Schema.String),
  client_uri: Schema.optional(Schema.String),
  logo_uri: Schema.optional(Schema.String),
  scope: Schema.optional(Schema.String),
  grant_types: Schema.optional(Schema.Array(Schema.String)),
  response_types: Schema.optional(Schema.Array(Schema.String)),
  token_endpoint_auth_method: Schema.optional(Schema.String),
  contacts: Schema.optional(Schema.Array(Schema.String)),
}) {}

const ClientIdMetadataVerdictTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/effect-contract/ClientIdMetadataVerdict',
)
type ClientIdMetadataVerdictTypeId = typeof ClientIdMetadataVerdictTypeId

export class ClientIdMetadataAccepted extends Schema.TaggedClass<ClientIdMetadataAccepted>()(
  'ClientIdMetadataAccepted',
  {},
) {
  readonly [ClientIdMetadataVerdictTypeId] = ClientIdMetadataVerdictTypeId
}

export class PathlessClientIdUrl extends Schema.TaggedClass<PathlessClientIdUrl>()('PathlessClientIdUrl', {}) {
  readonly [ClientIdMetadataVerdictTypeId] = ClientIdMetadataVerdictTypeId
}

export class ClientIdUrlMismatch extends Schema.TaggedClass<ClientIdUrlMismatch>()('ClientIdUrlMismatch', {}) {
  readonly [ClientIdMetadataVerdictTypeId] = ClientIdMetadataVerdictTypeId
}

export class RedirectUriNotListed extends Schema.TaggedClass<RedirectUriNotListed>()('RedirectUriNotListed', {}) {
  readonly [ClientIdMetadataVerdictTypeId] = ClientIdMetadataVerdictTypeId
}

export const ClientIdMetadataVerdict = Schema.Union([
  ClientIdMetadataAccepted,
  PathlessClientIdUrl,
  ClientIdUrlMismatch,
  RedirectUriNotListed,
])
export type ClientIdMetadataVerdict = typeof ClientIdMetadataVerdict.Type
