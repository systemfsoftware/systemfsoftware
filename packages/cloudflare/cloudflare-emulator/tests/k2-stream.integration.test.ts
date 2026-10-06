import { apiTokenCredentials, Credentials } from '@distilled.cloud/cloudflare'
import { NodeServices } from '@effect/platform-node'
import { client as cloudflare } from '@systemfsoftware/alchemy-cloudflare'
import { Emulator, layer as emulatorLayer } from '@systemfsoftware/cloudflare-emulator'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer } from 'effect'
import * as FetchHttpClient from 'effect/http/FetchHttpClient'
import { observed } from './__fixtures__/observed-refusal.fixture.js'

const Feature = makeFeature({ it })

// openapi/slice.json: /accounts/{account_id}/k2/streams — the account id is the
// documented 32-hex form; the emulator's response bodies are hand-written from
// the slice's K2 schemas, never from the emulator's own output.
const ACCOUNT = '0123456789abcdef0123456789abcdef'
const params = { account_id: ACCOUNT }
const UNKNOWN_STREAM = 'ffffffffffffffffffffffffffffffff'

const streams = Effect.map(cloudflare.CloudflareClient, (api) => api['workers_k2_other'])

const createStream = (payload: {
  readonly name: string
  readonly http: { readonly enabled: false } | { readonly enabled: true; readonly authentication?: boolean }
  readonly retention_seconds?: number
  readonly worker_binding?: { readonly enabled: false } | { readonly enabled: true }
}) => Effect.flatMap(streams, (k2) => k2.postV4AccountsByAccountIdK2Streams({ params, payload }))

const listStreams = (query: { readonly name?: string; readonly page?: number; readonly per_page?: number }) =>
  Effect.flatMap(streams, (k2) => k2.getV4AccountsByAccountIdK2Streams({ params, query }))

const getStream = (stream_id: string) =>
  Effect.flatMap(
    streams,
    (k2) => k2.getV4AccountsByAccountIdK2StreamsByStreamId({ params: { account_id: ACCOUNT, stream_id } }),
  )

const patchStream = (
  stream_id: string,
  payload: {
    readonly http?: { readonly enabled: false } | { readonly enabled: true; readonly authentication?: boolean }
    readonly retention_seconds?: number
    readonly worker_binding?: { readonly enabled: false } | { readonly enabled: true }
  },
) =>
  Effect.flatMap(
    streams,
    (k2) => k2.patchV4AccountsByAccountIdK2StreamsByStreamId({ params: { account_id: ACCOUNT, stream_id }, payload }),
  )

const deleteStream = (stream_id: string) =>
  Effect.flatMap(
    streams,
    (k2) => k2.deleteV4AccountsByAccountIdK2StreamsByStreamId({ params: { account_id: ACCOUNT, stream_id } }),
  )

const listSubscriptions = (stream_id: string) =>
  Effect.flatMap(
    streams,
    (k2) => k2.getV4AccountsByAccountIdK2StreamsByStreamIdSubscriptions({ params: { account_id: ACCOUNT, stream_id } }),
  )

// EmulatorAdmin arms the fault by operation id, the same id the client sends.
const armRateLimit = (calls: number) =>
  Effect.flatMap(Emulator, (emulator) =>
    emulator.admin.armInjectedStatus({
      operation: 'postV4AccountsByAccountIdK2Streams',
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

Feature('K2 streams against the Cloudflare emulator')
  .live('drives the emulator over a real loopback HTTP socket with the generated client')
  // A fresh emulator per scenario keeps each one independent of the others.
  .withScenarioLayer(clientOnEmulator)
  .body(({ scenario }) => {
    scenario(
      'Two streams are created with their documented defaults and listed',
      Gherkin.Do.pipe(
        Given('an account with no streams')('account', () => Effect.succeed(ACCOUNT)),
        When('a stream named events is created with HTTP authentication on and no retention or binding')(
          'created',
          () => createStream({ http: { authentication: true, enabled: true }, name: 'events' }),
        ),
        Then('the stream carries the documented default retention and worker binding')((s, expect) => {
          const created = s.created.result
          return expect({
            created_at_equals_modified_at: created.created_at === created.modified_at,
            endpoint: created.endpoint,
            http: created.http,
            name: created.name,
            retention_seconds: created.retention_seconds,
            worker_binding: created.worker_binding,
          }).toEqual({
            created_at_equals_modified_at: true,
            endpoint: `https://${created.id}.k2.cloudflarestorage.com`,
            http: { authentication: true, enabled: true },
            name: 'events',
            retention_seconds: 604800,
            worker_binding: { enabled: false },
          })
        }),
        When('the same name is created a second time')(
          'duplicate',
          () => observed(createStream({ http: { enabled: false }, name: 'events' })),
        ),
        Then('the duplicate is refused as already existing')((s, expect) =>
          expect(s.duplicate).toEqual({
            code: 1003,
            kind: 'AlreadyExists',
            message: 'A stream named events already exists.',
            retryAfter: null,
          })
        ),
        When('a second stream is created with an explicit retention and an enabled worker binding')(
          'second',
          () =>
            createStream({
              http: { enabled: false },
              name: 'audit',
              retention_seconds: 86400,
              worker_binding: { enabled: true },
            }),
        ),
        Then('the explicit retention and binding are stored as given')((s, expect) =>
          expect({
            http: s.second.result.http,
            name: s.second.result.name,
            retention_seconds: s.second.result.retention_seconds,
            worker_binding: s.second.result.worker_binding,
          }).toEqual({
            http: { enabled: false },
            name: 'audit',
            retention_seconds: 86400,
            worker_binding: { enabled: true },
          })
        ),
        When('every stream is listed')('listed', () => listStreams({})),
        Then('both streams come back with the page size defaulted to their count')((s, expect) =>
          expect({
            names: s.listed.result.map((stream) => stream.name),
            page: s.listed.result_info.page,
            per_page: s.listed.result_info.per_page,
            total_count: s.listed.result_info.total_count,
          }).toEqual({ names: ['events', 'audit'], page: 1, per_page: 2, total_count: 2 })
        ),
        When('the list is filtered by the name audit')('filtered', () => listStreams({ name: 'audit' })),
        Then('only audit is listed and the page size follows the filtered count')((s, expect) =>
          expect({
            names: s.filtered.result.map((stream) => stream.name),
            per_page: s.filtered.result_info.per_page,
            total_count: s.filtered.result_info.total_count,
          }).toEqual({ names: ['audit'], per_page: 1, total_count: 1 })
        ),
        When('the list is filtered by a name that matches nothing')(
          'filteredEmpty',
          () => listStreams({ name: 'nothing-matches' }),
        ),
        Then('the empty page carries a zero count and the default page number')((s, expect) =>
          expect({
            names: s.filteredEmpty.result.map((stream) => stream.name),
            page: s.filteredEmpty.result_info.page,
            per_page: s.filteredEmpty.result_info.per_page,
            total_count: s.filteredEmpty.result_info.total_count,
          }).toEqual({ names: [], page: 1, per_page: 0, total_count: 0 })
        ),
        When('the list is asked for a page the emulator echoes without slicing')(
          'paged',
          () => listStreams({ page: 2, per_page: 1 }),
        ),
        Then('the requested page and size are echoed over the unfiltered result')((s, expect) =>
          expect({
            names: s.paged.result.map((stream) => stream.name),
            page: s.paged.result_info.page,
            per_page: s.paged.result_info.per_page,
            total_count: s.paged.result_info.total_count,
          }).toEqual({ names: ['events', 'audit'], page: 2, per_page: 1, total_count: 2 })
        ),
      ),
    )

    scenario(
      'An existing stream is read back, patched field by field and inspected for subscriptions',
      Gherkin.Do.pipe(
        Given('a stream named events exists with its defaults')(
          'created',
          () => createStream({ http: { authentication: true, enabled: true }, name: 'events' }),
        ),
        When('the stream is read by the id the creation returned')('read', (s) => getStream(s.created.result.id)),
        Then('the read repeats the created settings')((s, expect) =>
          expect({
            created_at: s.read.result.created_at,
            endpoint: s.read.result.endpoint,
            http: s.read.result.http,
            id: s.read.result.id,
            name: s.read.result.name,
            retention_seconds: s.read.result.retention_seconds,
            worker_binding: s.read.result.worker_binding,
          }).toEqual({
            created_at: s.created.result.created_at,
            endpoint: s.created.result.endpoint,
            http: s.created.result.http,
            id: s.created.result.id,
            name: s.created.result.name,
            retention_seconds: s.created.result.retention_seconds,
            worker_binding: s.created.result.worker_binding,
          })
        ),
        When('the stream is patched with an HTTP setting alone')(
          'patchedHttp',
          (s) => patchStream(s.created.result.id, { http: { authentication: false, enabled: true } }),
        ),
        Then('only HTTP changed and the retention and binding are kept')((s, expect) =>
          expect({
            http: s.patchedHttp.result.http,
            retention_seconds: s.patchedHttp.result.retention_seconds,
            worker_binding: s.patchedHttp.result.worker_binding,
          }).toEqual({
            http: { authentication: false, enabled: true },
            retention_seconds: 604800,
            worker_binding: { enabled: false },
          })
        ),
        When('the stream is patched with a retention and binding alone')(
          'patchedRest',
          (s) => patchStream(s.created.result.id, { retention_seconds: 3600, worker_binding: { enabled: true } }),
        ),
        Then('the retention and binding changed and the HTTP setting is kept')((s, expect) =>
          expect({
            http: s.patchedRest.result.http,
            retention_seconds: s.patchedRest.result.retention_seconds,
            worker_binding: s.patchedRest.result.worker_binding,
          }).toEqual({
            http: { authentication: false, enabled: true },
            retention_seconds: 3600,
            worker_binding: { enabled: true },
          })
        ),
        When('the subscriptions of the stream are listed')(
          'subscriptions',
          (s) => listSubscriptions(s.created.result.id),
        ),
        Then('the stream has no subscriptions')((s, expect) =>
          expect({ result: s.subscriptions.result, success: s.subscriptions.success }).toEqual({
            result: [],
            success: true,
          })
        ),
      ),
    )

    scenario(
      'A missing stream is refused on every read and a delete stays successful when repeated',
      Gherkin.Do.pipe(
        Given('a stream named events exists with its defaults')(
          'created',
          () => createStream({ http: { enabled: false }, name: 'events' }),
        ),
        When('a stream that was never created is read')('missingRead', () => observed(getStream(UNKNOWN_STREAM))),
        // The emulator answers 404 with code 10006; the slice's Workers code
        // table reserves 10007 for "Resource not found" (slice.json:30728).
        Then('the read is refused as not found')((s, expect) =>
          expect(s.missingRead).toEqual({
            code: 10006,
            kind: 'NotFound',
            message: 'K2 stream not found.',
            retryAfter: null,
          })
        ),
        When('a stream that was never created is patched')(
          'missingPatch',
          () => observed(patchStream(UNKNOWN_STREAM, { retention_seconds: 3600 })),
        ),
        Then('the patch is refused as not found')((s, expect) =>
          expect(s.missingPatch).toEqual({
            code: 10006,
            kind: 'NotFound',
            message: 'K2 stream not found.',
            retryAfter: null,
          })
        ),
        When('the subscriptions of a stream that was never created are listed')(
          'missingSubscriptions',
          () => observed(listSubscriptions(UNKNOWN_STREAM)),
        ),
        Then('the subscription listing is refused as not found')((s, expect) =>
          expect(s.missingSubscriptions).toEqual({
            code: 10006,
            kind: 'NotFound',
            message: 'K2 stream not found.',
            retryAfter: null,
          })
        ),
        When('the existing stream is deleted')('deleted', (s) => deleteStream(s.created.result.id)),
        Then('the delete answers an empty successful result')((s, expect) =>
          expect({ result: s.deleted.result, success: s.deleted.success }).toEqual({ result: {}, success: true })
        ),
        When('the same stream is deleted again')('reDeleted', (s) => deleteStream(s.created.result.id)),
        // The slice documents that deleting a missing stream also succeeds:
        // openapi/slice.json DELETE /accounts/{account_id}/k2/streams/{stream_id}.
        Then('the second delete also answers an empty successful result')((s, expect) =>
          expect({ result: s.reDeleted.result, success: s.reDeleted.success }).toEqual({ result: {}, success: true })
        ),
        When('the deleted stream is read again')('readAfterDelete', (s) => observed(getStream(s.created.result.id))),
        Then('it is now refused as not found')((s, expect) =>
          expect(s.readAfterDelete).toEqual({
            code: 10006,
            kind: 'NotFound',
            message: 'K2 stream not found.',
            retryAfter: null,
          })
        ),
        When('every stream is listed after the delete')('afterDelete', () => listStreams({})),
        Then('the account holds no streams again')((s, expect) =>
          expect({
            names: s.afterDelete.result.map((stream) => stream.name),
            total_count: s.afterDelete.result_info.total_count,
          }).toEqual({ names: [], total_count: 0 })
        ),
      ),
    )

    scenario(
      'A rate-limited create is retried by the client and an exhausted retry budget is reported',
      Gherkin.Do.pipe(
        Given('an account with no streams')('account', () => Effect.succeed(ACCOUNT)),
        When('a 429 fault is armed for one call and a stream is created')(
          'retried',
          () =>
            Effect.gen(function*() {
              yield* armRateLimit(1)
              return yield* createStream({ http: { enabled: false }, name: 'faulted' })
            }),
        ),
        Then('the client retries the rate-limited call and the stream is created')((s, expect) =>
          expect({ name: s.retried.result.name, success: s.retried.success }).toEqual({
            name: 'faulted',
            success: true,
          })
        ),
        When('a 429 fault is armed for every attempt and another stream is created')(
          'rateLimited',
          () =>
            Effect.gen(function*() {
              yield* armRateLimit(3)
              return yield* observed(createStream({ http: { enabled: false }, name: 'never_created' }))
            }),
        ),
        // settle-operation answers the injected fault with the fault's status,
        // its retry-after header and its envelope; the client honours the header
        // (0 seconds is not the client's 1-second default, so the value proves it).
        Then('the create fails as rate limited with the injected retry-after')((s, expect) =>
          expect(s.rateLimited).toEqual({
            code: 429,
            kind: 'RateLimited',
            message: 'Injected 429 fault.',
            retryAfter: 0,
          })
        ),
        When('the faults are cleared and every stream is listed')(
          'finalListing',
          () =>
            Effect.gen(function*() {
              yield* clearFaults
              return yield* listStreams({})
            }),
        ),
        Then('only the stream created on the retried attempt remains')((s, expect) =>
          expect({
            names: s.finalListing.result.map((stream) => stream.name),
            total_count: s.finalListing.result_info.total_count,
          }).toEqual({ names: ['faulted'], total_count: 1 })
        ),
      ),
    )
  })
