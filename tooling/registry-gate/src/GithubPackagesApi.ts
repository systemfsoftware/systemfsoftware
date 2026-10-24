import { Config, Effect, Layer, Match, Schema } from 'effect'
import * as HttpClient from 'effect/http/HttpClient'
import * as HttpClientRequest from 'effect/http/HttpClientRequest'
import * as HttpClientResponse from 'effect/http/HttpClientResponse'
import { canaryPackageName } from './Canary.schema.js'
import { PackageSummary, PackageVersions } from './CleanupPlan.schema.js'
import { PackagesApi } from './packages-api.service.js'
import { PackagesApiFailed } from './RegistryGateError.schema.js'

const failed = (error: { readonly message: string }): PackagesApiFailed =>
  new PackagesApiFailed({ detail: error.message })

const unexpectedStatus = (request: string, status: number): PackagesApiFailed =>
  new PackagesApiFailed({ detail: `${request} answered HTTP ${status}` })

const goneFrom = (request: string) => (status: number): Effect.Effect<boolean, PackagesApiFailed> =>
  Match.value(status).pipe(
    Match.when(404, () => Effect.succeed(true)),
    Match.when(200, () => Effect.succeed(false)),
    Match.orElse(() => Effect.fail(unexpectedStatus(request, status))),
  )

const makeApi = (client: HttpClient.HttpClient, packageUrl: string): PackagesApi['Service'] => {
  const statusOf = (request: HttpClientRequest.HttpClientRequest): Effect.Effect<number, PackagesApiFailed> =>
    Effect.mapError(Effect.map(client.execute(request), (response) => response.status), failed)

  const summary: Effect.Effect<PackageSummary, PackagesApiFailed> = client.execute(HttpClientRequest.get(packageUrl))
    .pipe(
      Effect.flatMap(HttpClientResponse.filterStatusOk),
      Effect.flatMap(HttpClientResponse.schemaBodyJson(PackageSummary)),
      Effect.mapError(failed),
    )

  const listedVersions = (response: HttpClientResponse.HttpClientResponse) =>
    Match.value(response.status).pipe(
      Match.when(404, () => Effect.succeed<PackageVersions>([])),
      Match.orElse(() =>
        Effect.flatMap(
          HttpClientResponse.filterStatusOk(response),
          HttpClientResponse.schemaBodyJson(PackageVersions),
        )
      ),
    )

  const versions: Effect.Effect<PackageVersions, PackagesApiFailed> = client.execute(
    HttpClientRequest.get(`${packageUrl}/versions?per_page=100`),
  ).pipe(Effect.flatMap(listedVersions), Effect.mapError(failed))

  const deleted = (url: string): Effect.Effect<void, PackagesApiFailed> =>
    client.execute(HttpClientRequest.delete(url)).pipe(
      Effect.flatMap(HttpClientResponse.filterStatusOk),
      Effect.asVoid,
      Effect.mapError(failed),
    )

  return {
    visibility: Effect.map(summary, (listed) => listed.visibility),
    versions,
    deleteVersion: (id) => deleted(`${packageUrl}/versions/${id}`),
    deletePackage: deleted(packageUrl),
    versionGone: (id) =>
      Effect.flatMap(
        statusOf(HttpClientRequest.get(`${packageUrl}/versions/${id}`)),
        goneFrom(`GET version ${id}`),
      ),
    packageGone: Effect.flatMap(statusOf(HttpClientRequest.get(packageUrl)), goneFrom('GET package')),
  }
}

export const layer: Layer.Layer<PackagesApi, Config.ConfigError, HttpClient.HttpClient> = Layer.effect(
  PackagesApi,
  Effect.gen(function*() {
    const token = yield* Config.schema(Schema.Redacted(Schema.NonEmptyString), 'GITHUB_TOKEN')
    const owner = yield* Config.NonEmptyString('GITHUB_REPOSITORY_OWNER')
    const client = HttpClient.mapRequest(
      yield* HttpClient.HttpClient,
      (request) =>
        request.pipe(
          HttpClientRequest.bearerToken(token),
          HttpClientRequest.setHeaders({ accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' }),
        ),
    )
    return PackagesApi.of(
      makeApi(client, `https://api.github.com/orgs/${owner}/packages/npm/${canaryPackageName}`),
    )
  }),
)
