import { apiTokenCredentials, Credentials } from '@distilled.cloud/cloudflare'
import { NodeServices } from '@effect/platform-node'
import { client as cloudflare } from '@systemfsoftware/alchemy-cloudflare'
import { Emulator, layer as emulatorLayer } from '@systemfsoftware/cloudflare-emulator'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Duration, Effect, Layer, Result, Schema } from 'effect'
import * as FetchHttpClient from 'effect/http/FetchHttpClient'

const Feature = makeFeature({ it })

const ACCOUNT = '0123456789abcdef0123456789abcdef'
const params = { account_id: ACCOUNT }
const UNKNOWN_SINK = 'ffffffffffffffffffffffffffffffff'

const sinks = Effect.map(cloudflare.CloudflareClient, (api) => api['workers_pipelines_other'])

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
      onFailure: observedError,
      onSuccess: (): Refusal => ({ kind: 'Ok', code: 0, message: '', retryAfter: null }),
    })),
  )

const createSink = (payload: { readonly name: string; readonly type: 'r2' | 'r2_data_catalog' | 'basin_catalog' }) =>
  Effect.flatMap(sinks, (pipelines) => pipelines.postV4AccountsByAccountIdPipelinesV1Sinks({ params, payload }))

const listSinks = (query: { readonly name?: string; readonly page?: number; readonly per_page?: number }) =>
  Effect.flatMap(sinks, (pipelines) => pipelines.getV4AccountsByAccountIdPipelinesV1Sinks({ params, query }))

const getSink = (sink_id: string) =>
  Effect.flatMap(
    sinks,
    (pipelines) =>
      pipelines.getV4AccountsByAccountIdPipelinesV1SinksBySinkId({ params: { account_id: ACCOUNT, sink_id } }),
  )

const deleteSink = (sink_id: string) =>
  Effect.flatMap(
    sinks,
    (pipelines) =>
      pipelines.deleteV4AccountsByAccountIdPipelinesV1SinksBySinkId({ params: { account_id: ACCOUNT, sink_id } }),
  )

const armRateLimit = (operation: string, calls: number) =>
  Effect.flatMap(
    Emulator,
    (emulator) => emulator.admin.armInjectedStatus({ operation, status: 429, retryAfterSeconds: 0, calls }),
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

Feature('Pipelines sinks against the Cloudflare emulator')
  .live('drives the emulator over a real loopback HTTP socket with the generated client')
  .withScenarioLayer(clientOnEmulator)
  .body(({ scenario }) => {
    scenario(
      'A sink is created, a duplicate name is refused, and the sink is listed and read back',
      Gherkin.Do.pipe(
        Given('an account with no sinks')('account', () => Effect.succeed(ACCOUNT)),
        When('a sink create is sent with a name and type')('created', () => createSink({ name: 'audit', type: 'r2' })),
        Then('the created sink carries the name and type it was given')((s, expect) =>
          expect({ name: s.created.result.name, type: s.created.result.type }).toEqual({ name: 'audit', type: 'r2' })
        ),
        When('a second sink with the same name is created')(
          'duplicate',
          () => observed(createSink({ name: 'audit', type: 'r2_data_catalog' })),
        ),
        Then('the duplicate is refused as already existing')((s, expect) =>
          expect(s.duplicate).toEqual({
            code: 1003,
            kind: 'AlreadyExists',
            message: 'A sink named audit already exists.',
            retryAfter: null,
          })
        ),
        When('every sink is listed')('listed', () => listSinks({})),
        Then('the account lists only the first sink with the page defaulted to all of them')((s, expect) =>
          expect({
            names: s.listed.result.map((sink) => sink.name),
            page: s.listed.result_info.page,
            per_page: s.listed.result_info.per_page,
            total_count: s.listed.result_info.total_count,
          }).toEqual({ names: ['audit'], page: 1, per_page: 1, total_count: 1 })
        ),
        When('the created sink is read by its id')('read', (s) => getSink(s.created.result.id)),
        Then('the read answers the sink that was created')((s, expect) =>
          expect(s.read.result).toEqual(s.created.result)
        ),
      ),
    )

    scenario(
      'A sink that was never created is refused by id and its delete stays successful',
      Gherkin.Do.pipe(
        Given('an account with no sinks')('account', () => Effect.succeed(ACCOUNT)),
        When('a sink that was never created is read')('missingRead', () => observed(getSink(UNKNOWN_SINK))),
        Then('the read is refused as not found')((s, expect) =>
          expect(s.missingRead).toEqual({
            code: 1015,
            kind: 'NotFound',
            message: 'Sink not found.',
            retryAfter: null,
          })
        ),
        When('the same sink is deleted')('deleted', () => deleteSink(UNKNOWN_SINK)),
        Then('the delete answers an empty successful result')((s, expect) =>
          expect({ result: s.deleted.result, success: s.deleted.success }).toEqual({ result: {}, success: true })
        ),
        When('the same sink is deleted again')('reDeleted', () => deleteSink(UNKNOWN_SINK)),
        Then('the second delete also answers an empty successful result')((s, expect) =>
          expect({ result: s.reDeleted.result, success: s.reDeleted.success }).toEqual({ result: {}, success: true })
        ),
      ),
    )

    scenario(
      'A rate-limited listing is retried by the client and an exhausted retry budget is reported',
      Gherkin.Do.pipe(
        Given('an account with no sinks')('account', () => Effect.succeed(ACCOUNT)),
        When('a 429 fault is armed for one call and the sinks are listed')(
          'retried',
          () =>
            Effect.gen(function*() {
              yield* armRateLimit('getV4AccountsByAccountIdPipelinesV1Sinks', 1)
              return yield* listSinks({})
            }),
        ),
        Then('the client retries the rate-limited call and the listing succeeds')((s, expect) =>
          expect({
            names: s.retried.result.map((sink) => sink.name),
            success: s.retried.success,
            total_count: s.retried.result_info.total_count,
          }).toEqual({ names: [], success: true, total_count: 0 })
        ),
        When('a 429 fault is armed for every attempt and the sinks are listed again')(
          'rateLimited',
          () =>
            Effect.gen(function*() {
              yield* armRateLimit('getV4AccountsByAccountIdPipelinesV1Sinks', 3)
              return yield* observed(listSinks({}))
            }),
        ),
        Then('the listing fails as rate limited with the injected retry-after')((s, expect) =>
          expect(s.rateLimited).toEqual({
            code: 429,
            kind: 'RateLimited',
            message: 'Injected 429 fault.',
            retryAfter: 0,
          })
        ),
        When('the faults are cleared and the sinks are listed once more')(
          'finalListing',
          () =>
            Effect.gen(function*() {
              yield* clearFaults
              return yield* listSinks({})
            }),
        ),
        Then('the listing is answered again')((s, expect) =>
          expect({ success: s.finalListing.success, total_count: s.finalListing.result_info.total_count }).toEqual({
            success: true,
            total_count: 0,
          })
        ),
      ),
    )
  })
