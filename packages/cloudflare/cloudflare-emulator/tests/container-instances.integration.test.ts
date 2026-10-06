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
const UNKNOWN_APPLICATION = 'ffffffffffffffffffffffffffffffff'
const UNKNOWN_INSTANCE = 'b'.repeat(64)

const clients = Effect.map(cloudflare.CloudflareClient, (api) => ({
  applications: api['Applications'],
  instances: api['Container Instances'],
}))

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

const createDurableApplication = (name: string) =>
  Effect.flatMap(
    clients,
    ({ applications }) =>
      applications.createApplication({
        params,
        payload: {
          durable_objects: { class_name: 'AuditAgent', script_name: 'audit-worker' },
          name,
          scheduling_policy: 'durable_object',
        },
      }),
  )

const listInstances = (
  application_id: string,
  query: { readonly name_prefix?: string; readonly per_page?: number; readonly state?: 'active' | 'not-active' },
) =>
  Effect.flatMap(
    clients,
    ({ instances }) => instances.listContainerInstances({ params: { account_id: ACCOUNT, application_id }, query }),
  )

const getInstance = (application_id: string, instance_id: string) =>
  Effect.flatMap(
    clients,
    ({ instances }) => instances.getContainerInstance({ params: { account_id: ACCOUNT, application_id, instance_id } }),
  )

const armRateLimit = (calls: number) =>
  Effect.flatMap(Emulator, (emulator) =>
    emulator.admin.armInjectedStatus({
      operation: 'listContainerInstances',
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

Feature('Container instances against the Cloudflare emulator')
  .live('drives the emulator over a real loopback HTTP socket with the generated client')
  .withScenarioLayer(clientOnEmulator)
  .body(({ scenario }) => {
    scenario(
      'An application with no instances lists an empty page, and missing instances are refused',
      Gherkin.Do.pipe(
        Given('an account holding one Durable Object application')(
          'application',
          () => createDurableApplication('audit-agent'),
        ),
        When('the instances of the application are listed')(
          'listed',
          (s) => listInstances(s.application.result.id, {}),
        ),
        Then('the listing is an empty page of instances')((s, expect) =>
          expect({
            instances: s.listed.result.instances,
            per_page: s.listed.result_info.per_page ?? 'absent',
          }).toEqual({ instances: [], per_page: 0 })
        ),
        When('the instances are filtered to active ones with a name prefix and a page size')(
          'filtered',
          (s) => listInstances(s.application.result.id, { name_prefix: 'audit', per_page: 10, state: 'active' }),
        ),
        Then('the filtered listing is still empty and echoes the requested page size')((s, expect) =>
          expect({
            instances: s.filtered.result.instances,
            per_page: s.filtered.result_info.per_page ?? 'absent',
          }).toEqual({ instances: [], per_page: 10 })
        ),
        When('the instances are filtered to finished ones')(
          'notActive',
          (s) => listInstances(s.application.result.id, { state: 'not-active' }),
        ),
        Then('the not-active listing is empty too')((s, expect) => expect(s.notActive.result.instances).toEqual([])),
        When('an instance that was never created is read')(
          'missingInstance',
          (s) => observed(getInstance(s.application.result.id, UNKNOWN_INSTANCE)),
        ),
        Then('the read is refused as not found')((s, expect) =>
          expect(s.missingInstance).toEqual({
            code: 10006,
            kind: 'NotFound',
            message: 'Container instance not found.',
            retryAfter: null,
          })
        ),
        When('the instances of an application that was never created are listed')(
          'missingApplication',
          () => observed(listInstances(UNKNOWN_APPLICATION, {})),
        ),
        Then('the listing is refused as an application that is not found')((s, expect) =>
          expect(s.missingApplication).toEqual({
            code: 10006,
            kind: 'NotFound',
            message: 'Application not found.',
            retryAfter: null,
          })
        ),
      ),
    )

    scenario(
      'A rate-limited instance listing is retried by the client and an exhausted retry budget is reported',
      Gherkin.Do.pipe(
        Given('an account holding one Durable Object application')(
          'application',
          () => createDurableApplication('audit-agent'),
        ),
        When('a 429 fault is armed for one call and the instances are listed')(
          'retried',
          (s) =>
            Effect.gen(function*() {
              yield* armRateLimit(1)
              return yield* listInstances(s.application.result.id, {})
            }),
        ),
        Then('the client retries the rate-limited call and the listing succeeds')((s, expect) =>
          expect(s.retried.result.instances).toEqual([])
        ),
        When('a 429 fault is armed for every attempt and the instances are listed again')(
          'rateLimited',
          (s) =>
            Effect.gen(function*() {
              yield* armRateLimit(3)
              return yield* observed(listInstances(s.application.result.id, {}))
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
        When('the faults are cleared and the instances are listed once more')(
          'final',
          (s) =>
            Effect.gen(function*() {
              yield* clearFaults
              return yield* listInstances(s.application.result.id, {})
            }),
        ),
        Then('the listing is answered again')((s, expect) => expect(s.final.result.instances).toEqual([])),
      ),
    )
  })
