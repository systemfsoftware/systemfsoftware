import { Schema } from 'effect'
import { Scope } from '../../Contract/exposure.schema.js'

export class ProtectedResourceMetadata extends Schema.Class<ProtectedResourceMetadata>(
  '@systemfsoftware/effect-contract/mcp/ProtectedResourceMetadata',
)({
  resource: Schema.String,
  authorization_servers: Schema.Array(Schema.String),
  scopes_supported: Schema.Array(Scope),
  bearer_methods_supported: Schema.Array(Schema.String),
  resource_name: Schema.String,
  resource_documentation: Schema.optional(Schema.String),
}) {}

export interface ProtectedResourceOptions {
  readonly resource: string
  readonly authorizationServers: ReadonlyArray<string>
  readonly scopes: ReadonlyArray<Scope>
  readonly name: string
  readonly documentation?: string | undefined
}

export const protectedResourceMetadata = (options: ProtectedResourceOptions): ProtectedResourceMetadata =>
  new ProtectedResourceMetadata({
    resource: options.resource,
    authorization_servers: [...options.authorizationServers],
    scopes_supported: [...options.scopes],
    bearer_methods_supported: ['header'],
    resource_name: options.name,
    ...(options.documentation === undefined ? {} : { resource_documentation: options.documentation }),
  })

export const ProtectedResourcePath = Schema.TemplateLiteral([Schema.Literal('/'), Schema.String])
export type ProtectedResourcePath = typeof ProtectedResourcePath.Type

const WELL_KNOWN_PATH: ProtectedResourcePath = '/.well-known/oauth-protected-resource'

export const protectedResourcePaths = (resourcePath: string): readonly ProtectedResourcePath[] => [
  WELL_KNOWN_PATH,
  `${WELL_KNOWN_PATH}/${resourcePath}`,
]

export class UnauthenticatedChallenge extends Schema.TaggedClass<UnauthenticatedChallenge>()(
  'UnauthenticatedChallenge',
  {
    resourceMetadata: Schema.String,
  },
) {}

export class InsufficientScopeChallenge extends Schema.TaggedClass<InsufficientScopeChallenge>()(
  'InsufficientScopeChallenge',
  {
    resourceMetadata: Schema.String,
    scope: Scope,
  },
) {}

export const AuthChallenge = Schema.Union([UnauthenticatedChallenge, InsufficientScopeChallenge])
export type AuthChallenge = typeof AuthChallenge.Type
