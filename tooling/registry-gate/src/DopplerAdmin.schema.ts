import { Schema } from 'effect'

export const ServiceAccount = Schema.Struct({
  name: Schema.String,
  slug: Schema.String,
})
export type ServiceAccount = typeof ServiceAccount.Type

export const ServiceAccountsResponse = Schema.Struct({
  service_accounts: Schema.Array(ServiceAccount),
})

export const ServiceAccountResponse = Schema.Struct({
  service_account: ServiceAccount,
})

export const IdentityConfig = Schema.Struct({
  discovery_url: Schema.String,
  claims_type: Schema.Literals(['exact', 'wildcard']),
  claims: Schema.Struct({
    aud: Schema.Array(Schema.String),
    sub: Schema.Array(Schema.String),
  }),
})
export type IdentityConfig = typeof IdentityConfig.Type

export const ServiceAccountIdentity = Schema.Struct({
  slug: Schema.String,
  name: Schema.String,
  config: IdentityConfig,
  ttl_seconds: Schema.Finite,
})
export type ServiceAccountIdentity = typeof ServiceAccountIdentity.Type

export const IdentitiesResponse = Schema.Struct({
  identities: Schema.Array(ServiceAccountIdentity),
})

export const IdentityResponse = Schema.Struct({
  identity: ServiceAccountIdentity,
})

export const ConfigResponse = Schema.Struct({
  config: Schema.Struct({
    environment: Schema.String,
  }),
})

export const ProjectMember = Schema.Struct({
  type: Schema.String,
  slug: Schema.String,
  access_all_environments: Schema.optional(Schema.Boolean),
  environments: Schema.optional(Schema.Array(Schema.String)),
})
export type ProjectMember = typeof ProjectMember.Type

export const ProjectMembersResponse = Schema.Struct({
  members: Schema.Array(ProjectMember),
})

export class ProvisionFailed extends Schema.TaggedError<ProvisionFailed>()('ProvisionFailed', {
  detail: Schema.String,
}) {
  override get message(): string {
    return `the Doppler identity was not provisioned: ${this.detail}`
  }
}
