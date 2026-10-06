import { apiTokenCredentials, Credentials } from '@distilled.cloud/cloudflare'
import { NodeServices } from '@effect/platform-node'
import { api as cloudflareApi, client as cloudflare } from '@systemfsoftware/alchemy-cloudflare'
import { Emulator, layer as emulatorLayer } from '@systemfsoftware/cloudflare-emulator'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Duration, Effect, Layer, Result, Schema } from 'effect'
import * as FetchHttpClient from 'effect/http/FetchHttpClient'

const Feature = makeFeature({ it })

const ACCOUNT = '0123456789abcdef0123456789abcdef'
const params = { account_id: ACCOUNT }

const queries = Effect.map(cloudflare.CloudflareClient, (api) => api['Query run'])

type Refusal = {
  readonly kind: string
  readonly code: number
  readonly message: string
  readonly retryAfter: number | null
}

const shape = (kind: string, code: number, message: string): Refusal => ({ kind, code, message, retryAfter: null })

const observedError = <E>(error: E): Refusal => {
  if (Schema.is(cloudflare.NotFound)(error)) return shape('NotFound', error.code, error.message)
  if (Schema.is(cloudflare.AlreadyExists)(error)) return shape('AlreadyExists', error.code, error.message)
  if (Schema.is(cloudflare.Validation)(error)) return shape('Validation', error.code, error.message)
  if (Schema.is(cloudflare.Entitlement)(error)) return shape('Entitlement', error.code, error.message)
  if (Schema.is(cloudflare.RateLimited)(error)) {
    return { ...shape('RateLimited', error.code, error.message), retryAfter: Duration.toSeconds(error.retryAfter) }
  }
  if (Schema.is(cloudflare.CloudflareApiError)(error)) return shape('CloudflareApiError', error.code, error.message)
  if (Schema.is(Schema.instanceOf(Schema.SchemaError))(error)) {
    return shape('SchemaError', 0, error.message)
  }
  return shape('Unclassified', 0, 'The call failed outside the Cloudflare envelope.')
}

const observed = <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<Refusal, never, R> =>
  effect.pipe(
    Effect.result,
    Effect.map(Result.match({
      onFailure: (error: E) => observedError(error),
      onSuccess: (): Refusal => ({ kind: 'Ok', code: 0, message: '', retryAfter: null }),
    })),
  )

type QueryRequest = cloudflareApi.TelemetryQueryRequestJson

const runQuery = (payload: QueryRequest) => Effect.flatMap(queries, (api) => api.telemetryQuery({ params, payload }))

const armRateLimit = (calls: number) =>
  Effect.flatMap(
    Emulator,
    (emulator) =>
      emulator.admin.armInjectedStatus({ operation: 'telemetryQuery', status: 429, retryAfterSeconds: 0, calls }),
  )

const clearFaults = Effect.flatMap(Emulator, (emulator) => emulator.admin.clearFaults)

const emulatorCredentials = Layer.effect(
  Credentials,
  Effect.map(
    Emulator,
    (emulator) => Effect.succeed(apiTokenCredentials({ apiToken: 'emulator', apiBaseUrl: emulator.baseUrl })),
  ),
)

const clientOnEmulator = Layer.mergeAll(
  cloudflare.CloudflareClientLive.pipe(Layer.provide(FetchHttpClient.layer)),
  emulatorCredentials,
).pipe(Layer.provideMerge(emulatorLayer), Layer.provideMerge(NodeServices.layer), Layer.orDie)

Feature('Telemetry queries against the Cloudflare emulator')
  .live('drives the emulator over a real loopback HTTP socket with the generated client')
  .withScenarioLayer(clientOnEmulator)
  .body(({ scenario }) => {
    scenario(
      'A query with an inverted timeframe is refused while a valid one reports its run',
      Gherkin.Do.pipe(
        Given('an account with no traces')('account', () => Effect.succeed(ACCOUNT)),
        When('a query whose timeframe ends where it starts is run')(
          'inverted',
          () => observed(runQuery({ queryId: 'inverted', timeframe: { from: 10, to: 10 } })),
        ),
        Then('the query is refused with the timeframe message')((s, expect) =>
          expect(s.inverted).toEqual({
            code: 1003,
            kind: 'Validation',
            message: 'The timeframe must start before it ends.',
            retryAfter: null,
          })
        ),
        When('a query with a granularity and a ray id filter is run')(
          'answered',
          () =>
            runQuery({
              dry: true,
              granularity: 60,
              parameters: {
                filters: [
                  { key: 'rayId', kind: 'filter', operation: 'eq', type: 'string', value: 'abc123' },
                  { key: '$metadata.rayId', kind: 'filter', operation: 'eq', type: 'number', value: 42 },
                ],
              },
              queryId: 'filtered',
              timeframe: { from: 0, to: 60 },
            }),
        ),
        Then('the run reports itself complete with the requested granularity')((s, expect) =>
          expect({
            account_id: s.answered.result.run.accountId,
            dry: s.answered.result.run.dry,
            events: s.answered.result.events?.count ?? 'absent',
            granularity: s.answered.result.run.granularity,
            rows_read: s.answered.result.statistics.rows_read,
            status: s.answered.result.run.status,
          }).toEqual({
            account_id: ACCOUNT,
            dry: true,
            events: 0,
            granularity: 60,
            rows_read: 0,
            status: 'COMPLETED',
          })
        ),
        When('a query with only a timeframe is run')(
          'defaults',
          () => runQuery({ queryId: 'defaults', timeframe: { from: 0, to: 60 } }),
        ),
        Then('the run applies the documented granularity and dry defaults')((s, expect) =>
          expect({
            dry: s.defaults.result.run.dry,
            granularity: s.defaults.result.run.granularity,
          }).toEqual({ dry: false, granularity: 30 })
        ),
      ),
    )

    scenario(
      'A rate-limited query is retried by the client and an exhausted retry budget is reported',
      Gherkin.Do.pipe(
        Given('an account with no traces')('account', () => Effect.succeed(ACCOUNT)),
        When('a 429 fault is armed for one call and a query is run')(
          'retried',
          () =>
            Effect.gen(function*() {
              yield* armRateLimit(1)
              return yield* runQuery({ queryId: 'retried', timeframe: { from: 0, to: 60 } })
            }),
        ),
        Then('the client retries the rate-limited call and the query is answered')((s, expect) =>
          expect(s.retried.result.run.status).toEqual('COMPLETED')
        ),
        When('a 429 fault is armed for every attempt and another query is run')(
          'rateLimited',
          () =>
            Effect.gen(function*() {
              yield* armRateLimit(3)
              return yield* observed(runQuery({ queryId: 'never', timeframe: { from: 0, to: 60 } }))
            }),
        ),
        Then('the query fails as rate limited with the injected retry-after')((s, expect) =>
          expect(s.rateLimited).toEqual({
            code: 429,
            kind: 'RateLimited',
            message: 'Injected 429 fault.',
            retryAfter: 0,
          })
        ),
        When('the faults are cleared and a query is run once more')(
          'final',
          () =>
            Effect.gen(function*() {
              yield* clearFaults
              return yield* runQuery({ queryId: 'final', timeframe: { from: 0, to: 60 } })
            }),
        ),
        Then('the query is answered again')((s, expect) => expect(s.final.result.run.status).toEqual('COMPLETED')),
      ),
    )
  })
