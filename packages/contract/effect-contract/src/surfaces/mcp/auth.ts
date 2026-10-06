import { Array as Arr, Context, Match, Option, Schema } from 'effect'
import { dual } from 'effect/Function'
import { Contract, Principal } from '../../mod.js'
import {
  type AuthChallenge,
  InsufficientScopeChallenge,
  UnauthenticatedChallenge,
} from './protected-resource.schema.js'

export type { AuthChallenge } from './protected-resource.schema.js'

export class CurrentPrincipal extends Context.Service<CurrentPrincipal, Principal.Principal>()(
  '@systemfsoftware/effect-contract/mcp/CurrentPrincipal',
) {}

export interface ResourceMetadataUrlOptions {
  readonly baseUrl: string
  readonly resourcePath: string
}

export const resourceMetadataUrl = (options: ResourceMetadataUrlOptions): string =>
  `${options.baseUrl}/.well-known/oauth-protected-resource/${options.resourcePath}`

const writeScope: Contract.Scope = Option.getOrThrow(Schema.decodeOption(Contract.Scope)('write'))

export const requiredScopeOf = (access: Contract.Access): Option.Option<Contract.Scope> =>
  Match.value(access).pipe(
    Match.tag('Read', () => Option.none<Contract.Scope>()),
    Match.tag('Write', () => Option.some(writeScope)),
    Match.tag('DurableWrite', () => Option.some(writeScope)),
    Match.exhaustive,
  )

export interface ChallengeOfOptions {
  readonly resourceMetadata: string
  readonly requiredScope?: Contract.Scope | undefined
}

const challengeVerdict = (
  _verdict: Principal.TokenVerdict,
  options: ChallengeOfOptions,
): AuthChallenge =>
  Option.match(Option.fromUndefinedOr(options.requiredScope), {
    onNone: () => new UnauthenticatedChallenge({ resourceMetadata: options.resourceMetadata }),
    onSome: (scope) => new InsufficientScopeChallenge({ resourceMetadata: options.resourceMetadata, scope }),
  })

export interface ChallengeOf {
  (verdict: Principal.TokenVerdict, options: ChallengeOfOptions): AuthChallenge
  (options: ChallengeOfOptions): (verdict: Principal.TokenVerdict) => AuthChallenge
}

export const challengeOf: ChallengeOf = dual(2, challengeVerdict)

export interface InsufficientScopeOptions {
  readonly resourceMetadata: string
  readonly scope: Contract.Scope
}

export const insufficientScopeChallenge = (options: InsufficientScopeOptions): AuthChallenge =>
  new InsufficientScopeChallenge({ resourceMetadata: options.resourceMetadata, scope: options.scope })

interface BearerChallengeOptions {
  readonly resourceMetadata: string
  readonly scope: Option.Option<Contract.Scope>
  readonly error: Option.Option<string>
}

const bearerParts = (options: BearerChallengeOptions): ReadonlyArray<string> => [
  `resource_metadata="${options.resourceMetadata}"`,
  ...Option.match(options.error, { onNone: () => [], onSome: (error) => [`error="${error}"`] }),
  ...Option.match(options.scope, { onNone: () => [], onSome: (scope) => [`scope="${scope}"`] }),
]

const bearerChallenge = (options: BearerChallengeOptions): string => `Bearer ${Arr.join(bearerParts(options), ', ')}`

export const challengeResponse = (challenge: AuthChallenge): Response =>
  Match.value(challenge).pipe(
    Match.tag(
      'UnauthenticatedChallenge',
      (unauthenticated) =>
        new Response(null, {
          status: 401,
          headers: {
            'www-authenticate': bearerChallenge({
              resourceMetadata: unauthenticated.resourceMetadata,
              scope: Option.none(),
              error: Option.none(),
            }),
          },
        }),
    ),
    Match.tag(
      'InsufficientScopeChallenge',
      (insufficient) =>
        new Response(null, {
          status: 403,
          headers: {
            'www-authenticate': bearerChallenge({
              resourceMetadata: insufficient.resourceMetadata,
              scope: Option.some(insufficient.scope),
              error: Option.some('insufficient_scope'),
            }),
          },
        }),
    ),
    Match.exhaustive,
  )
