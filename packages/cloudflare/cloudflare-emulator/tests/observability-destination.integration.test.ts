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
const DESTINATION_CREATED = 'https://logs.example.com/ingest'
const DESTINATION_UPDATED = 'https://logs2.example.com/ingest'
const UNKNOWN_SLUG = 'ffffffffffffffffffffffffffffffff'

const destinations = Effect.map(cloudflare.CloudflareClient, (api) => api['Destinations'])

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

// The create body the client now sends; slice.json destination.create requires
// name, enabled and configuration{type,logpushDataset,url,headers}.
const createDestination = () =>
  Effect.flatMap(
    destinations,
    (api) =>
      api.destinationCreate({
        params,
        payload: {
          configuration: {
            headers: { authorization: 'Bearer token' },
            logpushDataset: 'opentelemetry-traces',
            type: 'logpush',
            url: DESTINATION_CREATED,
          },
          enabled: true,
          name: 'audit-sink',
        },
      }),
  )

const listDestinations = (query: { readonly order?: 'asc' | 'desc'; readonly orderBy?: 'created' | 'updated' } = {}) =>
  Effect.flatMap(destinations, (api) => api.destinationList({ params, query }))

const updateDestination = (slug: string, enabled: boolean) =>
  Effect.flatMap(
    destinations,
    (api) =>
      api.destinationUpdate({
        params: { account_id: ACCOUNT, slug },
        payload: {
          configuration: { headers: {}, type: 'logpush', url: DESTINATION_UPDATED },
          enabled,
        },
      }),
  )

const deleteDestination = (slug: string) =>
  Effect.flatMap(destinations, (api) => api.destinationsDelete({ params: { account_id: ACCOUNT, slug } }))

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

Feature('Observability destinations against the Cloudflare emulator')
  .live('drives the emulator over a real loopback HTTP socket with the generated client')
  .withScenarioLayer(clientOnEmulator)
  .body(({ scenario }) => {
    scenario(
      'A destination is created, listed with its list projection, updated and deleted',
      Gherkin.Do.pipe(
        Given('an account with no destinations')('account', () => Effect.succeed(ACCOUNT)),
        When('a logpush destination is created')('created', () => createDestination()),
        Then('the created destination carries the single projection')((s, expect) =>
          // slice.json destination.create 201 repeats the request as a single entry:
          // configuration{type,logpushDataset,logpushJob,destination_conf,url}; no jobStatus.
          expect({
            job_is_number: typeof s.created.result.configuration.logpushJob === 'number',
            no_job_status: 'jobStatus' in s.created.result.configuration === false,
            scripts: s.created.result.scripts,
            slug_is_hex32: /^[0-9a-f]{32}$/.test(s.created.result.slug),
            dataset: s.created.result.configuration.logpushDataset,
            enabled: s.created.result.enabled,
            name: s.created.result.name,
            type: s.created.result.configuration.type,
            url: s.created.result.configuration.url,
          }).toEqual({
            job_is_number: true,
            no_job_status: true,
            scripts: [],
            slug_is_hex32: true,
            dataset: 'opentelemetry-traces',
            enabled: true,
            name: 'audit-sink',
            type: 'logpush',
            url: DESTINATION_CREATED,
          })
        ),
        When('the destinations are listed')('listed', () => listDestinations()),
        Then('the listing projects the entry with its job status and headers')((s, expect) =>
          // slice.json destination.list 200 requires configuration.jobStatus and headers;
          // the list projection omits logpushJob.
          expect({
            count: s.listed.result.length,
            name: s.listed.result[0]?.name ?? 'absent',
            enabled: s.listed.result[0]?.enabled ?? 'absent',
            headers: s.listed.result[0]?.configuration.headers ?? 'absent',
            job_status: s.listed.result[0]?.configuration.jobStatus ?? 'absent',
            no_logpush_job: s.listed.result[0] === undefined
              ? 'absent'
              : 'logpushJob' in s.listed.result[0].configuration === false,
            dataset: s.listed.result[0]?.configuration.logpushDataset ?? 'absent',
            url: s.listed.result[0]?.configuration.url ?? 'absent',
          }).toEqual({
            count: 1,
            name: 'audit-sink',
            enabled: true,
            headers: { authorization: 'Bearer token' },
            job_status: { error_message: '', last_complete: '', last_error: '' },
            no_logpush_job: true,
            dataset: 'opentelemetry-traces',
            url: DESTINATION_CREATED,
          })
        ),
        When('the destination is disabled and pointed at a new URL')(
          'updated',
          (s) => updateDestination(s.created.result.slug, false),
        ),
        Then('the update applies the new URL and enabled flag')((s, expect) =>
          expect({
            dataset: s.updated.result.configuration.logpushDataset,
            enabled: s.updated.result.enabled,
            name: s.updated.result.name,
            url: s.updated.result.configuration.url,
          }).toEqual({
            dataset: 'opentelemetry-traces',
            enabled: false,
            name: 'audit-sink',
            url: DESTINATION_UPDATED,
          })
        ),
        When('the destination is deleted')('deleted', (s) => deleteDestination(s.created.result.slug)),
        Then('the delete reports the removed destination')((s, expect) =>
          expect({
            name: s.deleted.result?.name ?? 'absent',
            slug_matches: s.deleted.result?.slug === s.created.result.slug,
          }).toEqual({ name: 'audit-sink', slug_matches: true })
        ),
        When('the destinations are listed after the delete')('listedAfterDelete', () => listDestinations()),
        Then('no destination remains')((s, expect) => expect(s.listedAfterDelete.result).toEqual([])),
      ),
    )

    scenario(
      'Updating and deleting a destination that was never created are refused as not found',
      Gherkin.Do.pipe(
        Given('an account with no destinations')('account', () => Effect.succeed(ACCOUNT)),
        When('a destination that was never created is updated')(
          'updateMissing',
          () => observed(updateDestination(UNKNOWN_SLUG, true)),
        ),
        Then('the update is refused as not found')((s, expect) =>
          // slice.json destination.update 404 documents the status only; 10006 is
          // Cloudflare's generic not-found code, carried by the emulator envelope.
          expect(s.updateMissing).toEqual({
            code: 10006,
            kind: 'NotFound',
            message: 'The destination was not found.',
            retryAfter: null,
          })
        ),
        When('a destination that was never created is deleted')(
          'deleteMissing',
          () => observed(deleteDestination(UNKNOWN_SLUG)),
        ),
        Then('the delete is refused as not found')((s, expect) =>
          expect(s.deleteMissing).toEqual({
            code: 10006,
            kind: 'NotFound',
            message: 'The destination was not found.',
            retryAfter: null,
          })
        ),
      ),
    )
  })
