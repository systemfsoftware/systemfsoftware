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
const UNKNOWN_NAMESPACE = 'ffffffffffffffffffffffffffffffff'

const namespaces = Effect.map(cloudflare.CloudflareClient, (api) => api['Workers KV Namespace'])

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

const createNamespace = (payload: {
  readonly title: string
  readonly jurisdiction?: 'eu' | 'fedramp' | 'us'
  readonly mode?: 'instant'
}) => Effect.flatMap(namespaces, (kv) => kv.workersKvNamespaceCreateANamespace({ params, payload }))

const listNamespaces = (query: { readonly page?: number; readonly per_page?: number }) =>
  Effect.flatMap(namespaces, (kv) => kv.workersKvNamespaceListNamespaces({ params, query }))

const getNamespace = (namespace_id: string) =>
  Effect.flatMap(
    namespaces,
    (kv) => kv.workersKvNamespaceGetANamespace({ params: { account_id: ACCOUNT, namespace_id } }),
  )

const renameNamespace = (namespace_id: string, title: string) =>
  Effect.flatMap(
    namespaces,
    (kv) =>
      kv.workersKvNamespaceRenameANamespace({ params: { account_id: ACCOUNT, namespace_id }, payload: { title } }),
  )

const removeNamespace = (namespace_id: string) =>
  Effect.flatMap(
    namespaces,
    (kv) => kv.workersKvNamespaceRemoveANamespace({ params: { account_id: ACCOUNT, namespace_id } }),
  )

const seedInstant = (entitled: boolean) =>
  Effect.flatMap(Emulator, (emulator) => emulator.admin.seedEntitlement({ product: 'kv-instant', entitled }))

const armRateLimit = (calls: number) =>
  Effect.flatMap(Emulator, (emulator) =>
    emulator.admin.armInjectedStatus({
      operation: 'workersKvNamespaceCreateANamespace',
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

Feature('Workers KV namespaces against the Cloudflare emulator')
  .live('drives the emulator over a real loopback HTTP socket with the generated client')
  .withScenarioLayer(clientOnEmulator)
  .body(({ scenario }) => {
    scenario(
      'A namespace is created, its title is guarded, and it is renamed and read back',
      Gherkin.Do.pipe(
        Given('an account with no namespaces')('account', () => Effect.succeed(ACCOUNT)),
        When('a namespace titled events is created in the EU jurisdiction')(
          'created',
          () => createNamespace({ title: 'events', jurisdiction: 'eu' }),
        ),
        Then('the namespace carries its title and jurisdiction and no mode')((s, expect) =>
          expect({
            jurisdiction: s.created.result?.jurisdiction,
            mode: s.created.result?.mode,
            supports_url_encoding: s.created.result?.supports_url_encoding,
            title: s.created.result?.title,
          }).toEqual({ jurisdiction: 'eu', mode: undefined, supports_url_encoding: false, title: 'events' })
        ),
        When('a second namespace titled events is created')(
          'duplicate',
          () => observed(createNamespace({ title: 'events' })),
        ),
        Then('the taken title is refused as already existing')((s, expect) =>
          expect(s.duplicate).toEqual({
            code: 10014,
            kind: 'AlreadyExists',
            message: 'A namespace with the title "events" already exists.',
            retryAfter: null,
          })
        ),
        When('the namespace is renamed to audit')(
          'renamed',
          (s) => renameNamespace(s.created.result?.id ?? UNKNOWN_NAMESPACE, 'audit'),
        ),
        When('the namespace is read by its id')('read', (s) => getNamespace(s.created.result?.id ?? UNKNOWN_NAMESPACE)),
        Then('the read answers the new title')((s, expect) =>
          expect({ id: s.read.result?.id, title: s.read.result?.title }).toEqual({
            id: s.created.result?.id,
            title: 'audit',
          })
        ),
        When('every namespace is listed')('listed', () => listNamespaces({})),
        Then('the account lists only the renamed namespace')((s, expect) =>
          expect({
            titles: s.listed.result?.map((namespace) => namespace.title) ?? 'absent',
            total_count: s.listed.result_info?.total_count ?? 'absent',
          }).toEqual({ titles: ['audit'], total_count: 1 })
        ),
      ),
    )

    scenario(
      'Namespace listings echo the requested page and default the page size to the count',
      Gherkin.Do.pipe(
        Given('an account with no namespaces')('account', () => Effect.succeed(ACCOUNT)),
        When('every namespace is listed')('listed', () => listNamespaces({})),
        Then('the empty listing carries the default page and a zero page size')((s, expect) =>
          expect({
            page: s.listed.result_info?.page ?? 'absent',
            per_page: s.listed.result_info?.per_page ?? 'absent',
            titles: s.listed.result?.map((namespace) => namespace.title) ?? 'absent',
            total_count: s.listed.result_info?.total_count ?? 'absent',
          }).toEqual({ page: 1, per_page: 0, titles: [], total_count: 0 })
        ),
        When('the listing is asked for the second page of five')(
          'paged',
          () => listNamespaces({ page: 2, per_page: 5 }),
        ),
        Then('the requested page and size are echoed')((s, expect) =>
          expect({
            page: s.paged.result_info?.page ?? 'absent',
            per_page: s.paged.result_info?.per_page ?? 'absent',
            total_count: s.paged.result_info?.total_count ?? 'absent',
          }).toEqual({ page: 2, per_page: 5, total_count: 0 })
        ),
      ),
    )

    scenario(
      'Empty titles and ungranted instant namespaces are refused while missing ones are not found',
      Gherkin.Do.pipe(
        Given('an account with no namespaces and no KV Instant entitlement')(
          'account',
          () =>
            Effect.gen(function*() {
              yield* seedInstant(false)
              return ACCOUNT
            }),
        ),
        When('a namespace with an empty title is created')(
          'emptyTitle',
          () => observed(createNamespace({ title: '' })),
        ),
        Then('the empty title is refused as a validation failure')((s, expect) =>
          expect(s.emptyTitle).toEqual({
            code: 10019,
            kind: 'Validation',
            message: 'The title is required.',
            retryAfter: null,
          })
        ),
        When('an instant namespace is created without the entitlement')(
          'ungranted',
          () => observed(createNamespace({ mode: 'instant', title: 'instant' })),
        ),
        Then('the instant create is refused with the entitlement message')((s, expect) =>
          expect(s.ungranted).toEqual({
            code: 1000,
            kind: 'Validation',
            message: 'Workers KV Instant is not available for this account.',
            retryAfter: null,
          })
        ),
        When('the entitlement is granted and the instant namespace is created again')(
          'granted',
          () =>
            Effect.gen(function*() {
              yield* seedInstant(true)
              return yield* observed(createNamespace({ mode: 'instant', title: 'instant' }))
            }),
        ),
        Then('the granted instant create succeeds in instant mode')((s, expect) =>
          expect(s.granted).toEqual({ kind: 'Ok', code: 0, message: '', retryAfter: null })
        ),
        When('a namespace that was never created is read')(
          'missingRead',
          () => observed(getNamespace(UNKNOWN_NAMESPACE)),
        ),
        Then('the read is refused as not found')((s, expect) =>
          expect(s.missingRead).toEqual({
            code: 10013,
            kind: 'NotFound',
            message: 'The namespace was not found.',
            retryAfter: null,
          })
        ),
        When('a namespace that was never created is renamed')(
          'missingRename',
          () => observed(renameNamespace(UNKNOWN_NAMESPACE, 'other')),
        ),
        Then('the rename is refused as not found')((s, expect) =>
          expect(s.missingRename).toEqual({
            code: 10013,
            kind: 'NotFound',
            message: 'The namespace was not found.',
            retryAfter: null,
          })
        ),
        When('a namespace that was never created is deleted')(
          'deleted',
          () => removeNamespace(UNKNOWN_NAMESPACE),
        ),
        Then('the delete answers a successful envelope with an empty result')((s, expect) =>
          expect({ result: s.deleted.result, success: s.deleted.success }).toEqual({ result: {}, success: true })
        ),
        When('the same namespace is deleted again')('reDeleted', () => removeNamespace(UNKNOWN_NAMESPACE)),
        Then('the second delete also succeeds')((s, expect) =>
          expect({ result: s.reDeleted.result, success: s.reDeleted.success }).toEqual({ result: {}, success: true })
        ),
      ),
    )

    scenario(
      'A rate-limited create is retried by the client and an exhausted retry budget is reported',
      Gherkin.Do.pipe(
        Given('an account with no namespaces')('account', () => Effect.succeed(ACCOUNT)),
        When('a 429 fault is armed for one call and a namespace is created')(
          'retried',
          () =>
            Effect.gen(function*() {
              yield* armRateLimit(1)
              return yield* observed(createNamespace({ title: 'retried' }))
            }),
        ),
        Then('the client retries the rate-limited call and the create succeeds')((s, expect) =>
          expect(s.retried).toEqual({ kind: 'Ok', code: 0, message: '', retryAfter: null })
        ),
        When('a 429 fault is armed for every attempt and another namespace is created')(
          'rateLimited',
          () =>
            Effect.gen(function*() {
              yield* armRateLimit(3)
              return yield* observed(createNamespace({ title: 'never_created' }))
            }),
        ),
        Then('the create fails as rate limited with the injected retry-after')((s, expect) =>
          expect(s.rateLimited).toEqual({
            code: 429,
            kind: 'RateLimited',
            message: 'Injected 429 fault.',
            retryAfter: 0,
          })
        ),
        When('the faults are cleared and every namespace is listed')(
          'finalListing',
          () =>
            Effect.gen(function*() {
              yield* clearFaults
              return yield* listNamespaces({})
            }),
        ),
        Then('only the namespace created through the retry exists')((s, expect) =>
          expect({
            titles: s.finalListing.result?.map((namespace) => namespace.title) ?? 'absent',
            total_count: s.finalListing.result_info?.total_count ?? 'absent',
          }).toEqual({ titles: ['retried'], total_count: 1 })
        ),
      ),
    )
  })
