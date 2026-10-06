import { apiTokenCredentials, Credentials } from '@distilled.cloud/cloudflare'
import { NodeServices } from '@effect/platform-node'
import { client as cloudflare } from '@systemfsoftware/alchemy-cloudflare'
import { Emulator, layer as emulatorLayer } from '@systemfsoftware/cloudflare-emulator'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Duration, Effect, Layer, Result, Schema } from 'effect'
import * as FetchHttpClient from 'effect/http/FetchHttpClient'

const Feature = makeFeature({ it })

// openapi/slice.json: /accounts/{account_id}/urlscanner/v2 — the scanner answers
// its own error document ({ errors: [{ detail, status, title }], message }).
const ACCOUNT = '0123456789abcdef0123456789abcdef'
const params = { account_id: ACCOUNT }
const UNKNOWN_SCAN = '00000000-0000-0000-0000-000000000000'

const scans = Effect.map(cloudflare.CloudflareClient, (api) => api['URL Scanner'])

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

const createScan = (payload: {
  readonly url: string
  readonly agentReadiness?: boolean
  readonly customagent?: string
  readonly visibility?: 'Public' | 'Unlisted'
}) => Effect.flatMap(scans, (scanner) => scanner.urlscannerCreateScanV2({ params, payload }))

const getScan = (scan_id: string) =>
  Effect.flatMap(scans, (scanner) => scanner.urlscannerGetScanV2({ params: { account_id: ACCOUNT, scan_id } }))

const searchScans = (query: { readonly q?: string; readonly size?: number }) =>
  Effect.flatMap(scans, (scanner) => scanner.urlscannerSearchScansV2({ params, query }))

const armRateLimit = (calls: number) =>
  Effect.flatMap(Emulator, (emulator) =>
    emulator.admin.armInjectedStatus({
      operation: 'urlscannerSearchScansV2',
      status: 429,
      retryAfterSeconds: 0,
      calls,
    }))

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

Feature('URL scans against the Cloudflare emulator')
  .live('drives the emulator over a real loopback HTTP socket with the generated client')
  .withScenarioLayer(clientOnEmulator)
  .body(({ scenario }) => {
    scenario(
      'A scan is queued with its options, read back with its Agent Readiness report, and found by search',
      Gherkin.Do.pipe(
        Given('an account with no scans')('account', () => Effect.succeed(ACCOUNT)),
        When('an unlisted Agent Readiness scan of example.com is submitted with a custom agent')(
          'created',
          () =>
            createScan({
              url: 'https://example.com/',
              agentReadiness: true,
              customagent: 'kiro-bot',
              visibility: 'Unlisted',
            }),
        ),
        Then('the submission is queued with the URL, visibility and agent it was given')((s, expect) =>
          expect({
            message: s.created.message,
            options: s.created.options,
            url: s.created.url,
            visibility: s.created.visibility,
          }).toEqual({
            message: 'Submission successful',
            options: { useragent: 'kiro-bot' },
            url: 'https://example.com/',
            visibility: 'unlisted',
          })
        ),
        When('the scan result is read by its uuid')('read', (s) => getScan(s.created.uuid)),
        Then('the report carries the scan and its Agent Readiness level')((s, expect) =>
          expect({
            level: s.read.meta.processors.agentReadiness?.level,
            url: s.read.task.url,
            uuid: s.read.task.uuid,
          }).toEqual({ level: 2, url: 'https://example.com/', uuid: s.created.uuid })
        ),
        When('the scans are searched for example.com')('searched', () => searchScans({ q: 'example.com' })),
        Then('the search finds the queued scan')((s, expect) =>
          expect(s.searched.results.map((result) => result._id)).toEqual([s.created.uuid])
        ),
        When('the scans are searched for a domain never scanned')(
          'unmatched',
          () => searchScans({ q: 'never-scanned.test', size: 10 }),
        ),
        Then('the filtered search is empty')((s, expect) => expect(s.unmatched).toEqual({ results: [] })),
      ),
    )

    scenario(
      'A scan without Agent Readiness reports no readiness, and an empty URL is refused',
      Gherkin.Do.pipe(
        Given('an account with no scans')('account', () => Effect.succeed(ACCOUNT)),
        When('a public scan of example.com is submitted')('created', () => createScan({ url: 'https://example.com/' })),
        When('the scan result is read by its uuid')('read', (s) => getScan(s.created.uuid)),
        Then('the scan is public and its report has no Agent Readiness result')((s, expect) =>
          expect({
            readiness: s.read.meta.processors.agentReadiness,
            visibility: s.read.task.visibility,
          }).toEqual({ readiness: undefined, visibility: 'public' })
        ),
        When('a scan with an empty URL is submitted')('empty', () => observed(createScan({ url: '' }))),
        Then('the submission is refused as a validation failure')((s, expect) =>
          expect(s.empty).toEqual({ code: 0, kind: 'Validation', message: 'HTTP 400', retryAfter: null })
        ),
      ),
    )

    scenario(
      'A scan that was never submitted is refused by its uuid',
      Gherkin.Do.pipe(
        Given('an account with no scans')('account', () => Effect.succeed(ACCOUNT)),
        When('a scan result that was never submitted is read')('missingRead', () => observed(getScan(UNKNOWN_SCAN))),
        Then('the read is refused as not found')((s, expect) =>
          expect(s.missingRead).toEqual({
            code: 0,
            kind: 'NotFound',
            message: 'HTTP 404',
            retryAfter: null,
          })
        ),
      ),
    )

    scenario(
      'A rate-limited search is retried by the client and an exhausted retry budget is reported',
      Gherkin.Do.pipe(
        Given('an account with no scans')('account', () => Effect.succeed(ACCOUNT)),
        When('a 429 fault is armed for one call and the scans are searched')(
          'retried',
          () =>
            Effect.gen(function*() {
              yield* armRateLimit(1)
              return yield* searchScans({})
            }),
        ),
        Then('the client retries the rate-limited call and the search succeeds')((s, expect) =>
          expect(s.retried).toEqual({ results: [] })
        ),
        When('a 429 fault is armed for every attempt and the scans are searched again')(
          'rateLimited',
          () =>
            Effect.gen(function*() {
              yield* armRateLimit(3)
              return yield* observed(searchScans({}))
            }),
        ),
        Then('the search fails as rate limited with the injected retry-after')((s, expect) =>
          expect(s.rateLimited).toEqual({
            code: 429,
            kind: 'RateLimited',
            message: 'Injected 429 fault.',
            retryAfter: 0,
          })
        ),
        When('the faults are cleared and the scans are searched once more')(
          'finalSearch',
          () =>
            Effect.gen(function*() {
              yield* clearFaults
              return yield* searchScans({})
            }),
        ),
        Then('the search is answered again')((s, expect) => expect(s.finalSearch).toEqual({ results: [] })),
      ),
    )
  })
