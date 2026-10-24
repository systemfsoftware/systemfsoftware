import { Config, Console, Effect, Match, Redacted, Schema } from 'effect'
import * as HttpClient from 'effect/http/HttpClient'
import type * as HttpClientError from 'effect/http/HttpClientError'
import * as HttpClientRequest from 'effect/http/HttpClientRequest'
import * as HttpClientResponse from 'effect/http/HttpClientResponse'
import {
  ConfigResponse,
  IdentitiesResponse,
  type IdentityConfig,
  IdentityResponse,
  type ProjectMember,
  ProjectMembersResponse,
  ProvisionFailed,
  type ServiceAccount,
  type ServiceAccountIdentity,
  ServiceAccountResponse,
  ServiceAccountsResponse,
} from './DopplerAdmin.schema.js'

const apiBase = 'https://api.doppler.com/v3'
const githubDiscoveryUrl = 'https://token.actions.githubusercontent.com/.well-known/openid-configuration'
const githubAudience = 'https://github.com/systemfsoftware'
const githubSubjects = [
  'repo:systemfsoftware/systemfsoftware:pull_request',
  'repo:systemfsoftware/systemfsoftware:ref:refs/heads/main',
]
const identityTtlSeconds = 300
const defaultProjectRole = 'collaborator'
const defaultAccountName = 'registry-gate'
const defaultIdentityName = 'systemfsoftware-repo'

interface ProvisionSettings {
  readonly token: Redacted.Redacted<string>
  readonly project: string
  readonly config: string
  readonly projectRole: string
  readonly accountName: string
  readonly identityName: string
}

const provisionSettings: Config.Config<ProvisionSettings> = Config.all({
  token: Config.schema(Schema.Redacted(Schema.NonEmptyString), 'DOPPLER_TOKEN'),
  project: Config.NonEmptyString('DOPPLER_PROJECT'),
  config: Config.NonEmptyString('DOPPLER_CONFIG'),
  projectRole: Config.withDefault(Config.NonEmptyString('DOPPLER_PROJECT_ROLE'), defaultProjectRole),
  accountName: Config.withDefault(Config.NonEmptyString('SERVICE_ACCOUNT_NAME'), defaultAccountName),
  identityName: Config.withDefault(Config.NonEmptyString('IDENTITY_NAME'), defaultIdentityName),
})

interface IdentitySpec {
  readonly name: string
  readonly method: 'oidc'
  readonly config: IdentityConfig
  readonly ttl_seconds: number
}

type IdentityState = 'created' | 'updated' | 'unchanged'

const requestFailed = (error: HttpClientError.HttpClientError | Schema.SchemaError): ProvisionFailed =>
  new ProvisionFailed({
    detail: Match.value(error).pipe(
      Match.tag('HttpClientError', (httpError) => httpError.message),
      Match.tag('SchemaError', () => 'the response did not decode'),
      Match.exhaustive,
    ),
  })

const urlOf = (path: string, params: Record<string, string> = {}): URL =>
  new URL(`${apiBase}${path}?${new URLSearchParams(params)}`)

const call = <S extends Schema.Top & { readonly DecodingServices: never }>(
  client: HttpClient.HttpClient,
  token: Redacted.Redacted<string>,
  request: HttpClientRequest.HttpClientRequest,
  schema: S,
) =>
  client.execute(HttpClientRequest.bearerToken(token)(request)).pipe(
    Effect.flatMap(HttpClientResponse.filterStatusOk),
    Effect.flatMap(HttpClientResponse.schemaBodyJson(schema)),
    Effect.mapError(requestFailed),
  )

const send = (
  client: HttpClient.HttpClient,
  token: Redacted.Redacted<string>,
  request: HttpClientRequest.HttpClientRequest,
): Effect.Effect<void, ProvisionFailed> =>
  client.execute(HttpClientRequest.bearerToken(token)(request)).pipe(
    Effect.flatMap(HttpClientResponse.filterStatusOk),
    Effect.mapError(requestFailed),
    Effect.asVoid,
  )

const sortedValues = (values: ReadonlyArray<string>): string => [...values].sort().join('\n')

const sameIdentityValues = (identity: ServiceAccountIdentity, spec: IdentitySpec): boolean =>
  identity.name === spec.name && identity.ttl_seconds === spec.ttl_seconds

const sameIdentityConfig = (identity: ServiceAccountIdentity, spec: IdentitySpec): boolean =>
  identity.config.discovery_url === spec.config.discovery_url &&
  identity.config.claims_type === spec.config.claims_type

const sameIdentityClaims = (identity: ServiceAccountIdentity, spec: IdentitySpec): boolean =>
  sortedValues(identity.config.claims.aud) === sortedValues(spec.config.claims.aud) &&
  sortedValues(identity.config.claims.sub) === sortedValues(spec.config.claims.sub)

const sameIdentity = (identity: ServiceAccountIdentity, spec: IdentitySpec): boolean =>
  [sameIdentityValues, sameIdentityConfig, sameIdentityClaims].every((check) => check(identity, spec))

const unchangedOrUpdated = (existing: ServiceAccountIdentity, spec: IdentitySpec): 'updated' | 'unchanged' => {
  if (sameIdentity(existing, spec)) return 'unchanged'
  return 'updated'
}

const upsertIdentity = (
  client: HttpClient.HttpClient,
  settings: ProvisionSettings,
  accountSlug: string,
  spec: IdentitySpec,
  existing: ServiceAccountIdentity | undefined,
): Effect.Effect<{ readonly identity: ServiceAccountIdentity; readonly state: IdentityState }, ProvisionFailed> => {
  if (existing === undefined) {
    return Effect.map(
      call(
        client,
        settings.token,
        HttpClientRequest.post(urlOf(`/workplace/service_accounts/service_account/${accountSlug}/identities`)).pipe(
          HttpClientRequest.bodyJsonUnsafe({ ...spec }),
        ),
        IdentityResponse,
      ),
      ({ identity }) => ({ identity, state: 'created' as const }),
    )
  }
  return Effect.map(
    call(
      client,
      settings.token,
      HttpClientRequest.put(
        urlOf(`/workplace/service_accounts/service_account/${accountSlug}/identities/identity/${existing.slug}`),
      ).pipe(HttpClientRequest.bodyJsonUnsafe({ ...spec })),
      IdentityResponse,
    ),
    ({ identity }) => ({ identity, state: unchangedOrUpdated(existing, spec) }),
  )
}

const isGateMember = (candidate: ProjectMember, accountSlug: string): boolean =>
  candidate.type === 'service_account' && candidate.slug === accountSlug

const environmentListed = (environments: ReadonlyArray<string> | undefined, environment: string): boolean =>
  environments !== undefined && environments.includes(environment)

const memberAccessOf = (member: ProjectMember, environment: string): boolean =>
  member.access_all_environments === true || environmentListed(member.environments, environment)

const ensureServiceAccount = (
  client: HttpClient.HttpClient,
  settings: ProvisionSettings,
): Effect.Effect<ServiceAccount, ProvisionFailed> =>
  Effect.flatMap(
    call(
      client,
      settings.token,
      HttpClientRequest.get(urlOf('/workplace/service_accounts', { per_page: '100' })),
      ServiceAccountsResponse,
    ),
    ({ service_accounts }) => {
      const existing = service_accounts.find((account) => account.name === settings.accountName)
      if (existing !== undefined) {
        return Effect.succeed(existing)
      }
      return Effect.map(
        call(
          client,
          settings.token,
          HttpClientRequest.post(urlOf('/workplace/service_accounts')).pipe(
            HttpClientRequest.bodyJsonUnsafe({ name: settings.accountName }),
          ),
          ServiceAccountResponse,
        ),
        ({ service_account }) => service_account,
      )
    },
  )

const identityOfName = (
  identities: ReadonlyArray<ServiceAccountIdentity>,
  name: string,
): ServiceAccountIdentity | undefined => identities.find((identity) => identity.name === name)

const ensureIdentity = (
  client: HttpClient.HttpClient,
  settings: ProvisionSettings,
  accountSlug: string,
  spec: IdentitySpec,
): Effect.Effect<
  { readonly identity: ServiceAccountIdentity; readonly state: IdentityState },
  ProvisionFailed
> =>
  Effect.flatMap(
    call(
      client,
      settings.token,
      HttpClientRequest.get(
        urlOf(`/workplace/service_accounts/service_account/${accountSlug}/identities`, { per_page: '100' }),
      ),
      IdentitiesResponse,
    ),
    ({ identities }) => upsertIdentity(client, settings, accountSlug, spec, identityOfName(identities, spec.name)),
  )

const accessOf = (
  member: ProjectMember,
  settings: ProvisionSettings,
  environment: string,
): Effect.Effect<string, ProvisionFailed> => {
  if (memberAccessOf(member, environment)) {
    return Effect.succeed(`project '${settings.project}': access already granted for environment '${environment}'`)
  }
  return Effect.fail(
    new ProvisionFailed({
      detail:
        `the service account is already a project member of '${settings.project}' without access to environment '${environment}'; widen its access in the Doppler dashboard and re-run`,
    }),
  )
}

const grantOrReport = (
  client: HttpClient.HttpClient,
  settings: ProvisionSettings,
  accountSlug: string,
  environment: string,
  member: ProjectMember | undefined,
): Effect.Effect<string, ProvisionFailed> => {
  if (member === undefined) {
    return Effect.as(
      send(
        client,
        settings.token,
        HttpClientRequest.post(urlOf('/projects/project/members', { project: settings.project })).pipe(
          HttpClientRequest.bodyJsonUnsafe({
            type: 'service_account',
            slug: accountSlug,
            role: settings.projectRole,
            environments: [environment],
          }),
        ),
      ),
      `project '${settings.project}': access granted for environment '${environment}' (role ${settings.projectRole})`,
    )
  }
  return accessOf(member, settings, environment)
}

const ensureProjectAccess = (
  client: HttpClient.HttpClient,
  settings: ProvisionSettings,
  accountSlug: string,
): Effect.Effect<string, ProvisionFailed> =>
  Effect.flatMap(
    call(
      client,
      settings.token,
      HttpClientRequest.get(urlOf('/configs/config', {
        project: settings.project,
        config: settings.config,
      })),
      ConfigResponse,
    ),
    ({ config }) =>
      Effect.flatMap(
        call(
          client,
          settings.token,
          HttpClientRequest.get(urlOf('/projects/project/members', { project: settings.project, per_page: '100' })),
          ProjectMembersResponse,
        ),
        ({ members }) =>
          grantOrReport(
            client,
            settings,
            accountSlug,
            config.environment,
            members.find((candidate) => isGateMember(candidate, accountSlug)),
          ),
      ),
  )

export const provisionDopplerIdentity: Effect.Effect<
  void,
  ProvisionFailed | Config.ConfigError,
  HttpClient.HttpClient
> = Effect.gen(function*() {
  const client = yield* HttpClient.HttpClient
  const settings = yield* provisionSettings
  const spec: IdentitySpec = {
    name: settings.identityName,
    method: 'oidc',
    config: {
      discovery_url: githubDiscoveryUrl,
      claims_type: 'exact',
      claims: { aud: [githubAudience], sub: [...githubSubjects] },
    },
    ttl_seconds: identityTtlSeconds,
  }
  const account = yield* ensureServiceAccount(client, settings)
  const { identity, state } = yield* ensureIdentity(client, settings, account.slug, spec)
  const access = yield* ensureProjectAccess(client, settings, account.slug)
  yield* Console.log(`service account '${account.name}' (${account.slug})`)
  yield* Console.log(`identity '${identity.name}' (${identity.slug}) ${state}`)
  yield* Console.log(`  discovery ${githubDiscoveryUrl}`)
  yield* Console.log(`  aud ${githubAudience}`)
  yield* Console.log(`  sub ${githubSubjects.join(', ')}`)
  yield* Console.log(`  claims_type exact, ttl ${identityTtlSeconds}s`)
  yield* Console.log(access)
  yield* Console.log(
    `Set the repository variable DOPPLER_IDENTITY_ID=${identity.slug} (a configuration value, not a secret)`,
  )
})
