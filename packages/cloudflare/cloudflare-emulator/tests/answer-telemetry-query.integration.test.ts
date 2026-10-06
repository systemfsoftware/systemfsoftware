import { apiTokenCredentials, Credentials } from '@distilled.cloud/cloudflare'
import { NodeServices } from '@effect/platform-node'
import { api as cloudflareApi, client as cloudflare } from '@systemfsoftware/alchemy-cloudflare'
import { Emulator, layer as emulatorLayer, type TelemetryTrace } from '@systemfsoftware/cloudflare-emulator'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer } from 'effect'
import * as FetchHttpClient from 'effect/http/FetchHttpClient'
import { observed } from './__fixtures__/observed-refusal.fixture.js'

const Feature = makeFeature({ it })

const ACCOUNT = '0123456789abcdef0123456789abcdef'
const params = { account_id: ACCOUNT }
const SEEDED_RAY = 'ray-seeded'
const SEEDED_EVENTS = [
  {
    $metadata: { id: 'event-1', scriptName: 'audit-worker', wallTimeMs: 5 },
    dataset: 'opentelemetry-traces',
    source: 'audit-worker',
    timestamp: 1,
  },
  {
    $metadata: { id: 'event-2', scriptName: 'audit-worker', wallTimeMs: 7 },
    dataset: 'opentelemetry-traces',
    source: 'audit-worker',
    timestamp: 2,
  },
]
const SEEDED_TRACE: TelemetryTrace = {
  account_id: ACCOUNT,
  events: SEEDED_EVENTS,
  rayId: SEEDED_RAY,
  traceId: 'trace-1',
}

const queries = Effect.map(cloudflare.CloudflareClient, (api) => api['Query run'])

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

    scenario(
      'A query whose ray id matches a recorded trace answers with that trace events',
      Gherkin.Do.pipe(
        Given('an account holding one recorded trace carrying two events')(
          'account',
          () =>
            Effect.flatMap(
              Emulator,
              (emulator) => emulator.admin.seedTelemetryTrace({ trace: SEEDED_TRACE }),
            ).pipe(Effect.as(ACCOUNT)),
        ),
        When('a query filtered by the recorded ray id inside a group is run')(
          'found',
          () =>
            runQuery({
              parameters: {
                filters: [
                  {
                    filterCombination: 'and',
                    filters: [{ key: 'rayId', kind: 'filter', operation: 'eq', type: 'string', value: SEEDED_RAY }],
                    kind: 'group',
                  },
                ],
              },
              queryId: 'found',
              timeframe: { from: 0, to: 60 },
            }),
        ),
        Then('the run reports the two recorded events')((s, expect) =>
          expect({
            count: s.found.result.events?.count ?? 'absent',
            rows_read: s.found.result.statistics.rows_read,
          }).toEqual({ count: 2, rows_read: 2 })
        ),
        When('a query filtered by a ray id no recorded trace carries is run')(
          'missing',
          () =>
            runQuery({
              parameters: {
                filters: [{
                  key: '$metadata.rayId',
                  kind: 'filter',
                  operation: 'eq',
                  type: 'string',
                  value: 'ray-absent',
                }],
              },
              queryId: 'missing',
              timeframe: { from: 0, to: 60 },
            }),
        ),
        Then('the run reports no events')((s, expect) =>
          expect({
            count: s.missing.result.events?.count ?? 'absent',
            rows_read: s.missing.result.statistics.rows_read,
          }).toEqual({ count: 0, rows_read: 0 })
        ),
      ),
    )

    scenario(
      'A trace recorded for another account is not visible to this one',
      Gherkin.Do.pipe(
        Given('another account holding a trace with the ray id this account will ask for')(
          'account',
          () =>
            Effect.flatMap(
              Emulator,
              (emulator) =>
                emulator.admin.seedTelemetryTrace({
                  trace: { ...SEEDED_TRACE, account_id: 'fedcba9876543210fedcba9876543210' },
                }),
            ).pipe(Effect.as(ACCOUNT)),
        ),
        When('this account queries by that ray id')(
          'foreign',
          () =>
            runQuery({
              parameters: {
                filters: [{ key: 'rayId', kind: 'filter', operation: 'eq', type: 'string', value: SEEDED_RAY }],
              },
              queryId: 'foreign',
              timeframe: { from: 0, to: 60 },
            }),
        ),
        Then('the run reports no events')((s, expect) =>
          expect({
            count: s.foreign.result.events?.count ?? 'absent',
            rows_read: s.foreign.result.statistics.rows_read,
          }).toEqual({ count: 0, rows_read: 0 })
        ),
      ),
    )
  })
