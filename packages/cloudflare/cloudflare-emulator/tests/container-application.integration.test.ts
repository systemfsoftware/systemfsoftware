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
const UNKNOWN_APPLICATION = 'ffffffffffffffffffffffffffffffff'

const applications = Effect.map(cloudflare.CloudflareClient, (api) => api['Applications'])

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

type ApplicationRequest = {
  readonly configuration?: {
    readonly authorized_keys?: ReadonlyArray<{ readonly name?: string; readonly public_key: string }>
    readonly wrangler_ssh?: { readonly enabled?: boolean; readonly port?: number }
  }
  readonly durable_objects:
    | { readonly namespace_id: string }
    | { readonly class_name: string; readonly script_name: string }
  readonly name: string
  readonly observability?: { readonly logs?: { readonly enabled?: boolean } }
  readonly scheduling_policy: 'durable_object'
}
type ApplicationPatch = cloudflareApi.ModifyApplicationRequestJson

const createApplication = (payload: ApplicationRequest) =>
  Effect.flatMap(applications, (api) => api.createApplication({ params, payload }))

const listApplications = (
  query: { readonly image?: string; readonly name?: string; readonly per_page?: number },
) => Effect.flatMap(applications, (api) => api.listApplications({ params, query }))

const getApplication = (application_id: string) =>
  Effect.flatMap(applications, (api) => api.getApplication({ params: { account_id: ACCOUNT, application_id } }))

const modifyApplication = (application_id: string, payload: ApplicationPatch) =>
  Effect.flatMap(
    applications,
    (api) => api.modifyApplication({ params: { account_id: ACCOUNT, application_id }, payload }),
  )

const deleteApplication = (application_id: string) =>
  Effect.flatMap(applications, (api) => api.deleteApplication({ params: { account_id: ACCOUNT, application_id } }))

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

Feature('Container applications against the Cloudflare emulator')
  .live('drives the emulator over a real loopback HTTP socket with the generated client')
  .withScenarioLayer(clientOnEmulator)
  .body(({ scenario }) => {
    scenario(
      'A Durable Object application is created from a class, listed, read, patched and deleted',
      Gherkin.Do.pipe(
        Given('an account with no applications')('account', () => Effect.succeed(ACCOUNT)),
        When('a Durable Object application is created from a class and script name')(
          'created',
          () =>
            createApplication({
              durable_objects: { class_name: 'AuditAgent', script_name: 'audit-worker' },
              name: 'audit-agent',
              scheduling_policy: 'durable_object',
            }),
        ),
        Then('the application is created with a generated namespace')((s, expect) =>
          expect({
            id_length: s.created.result.id.length,
            name: s.created.result.name,
            namespace_id_length: s.created.result.durable_objects?.namespace_id.length ?? 0,
            policy: s.created.result.scheduling_policy,
          }).toEqual({ id_length: 32, name: 'audit-agent', namespace_id_length: 32, policy: 'durable_object' })
        ),
        When('every application is listed')('listed', () => listApplications({})),
        Then('the single application is listed')((s, expect) =>
          expect(s.listed.result.map((application) => application.name)).toEqual(['audit-agent'])
        ),
        When('the listing is filtered by the name audit-agent with a page size')(
          'filteredName',
          () => listApplications({ name: 'audit-agent', per_page: 1 }),
        ),
        Then('the name filter selects the application')((s, expect) =>
          expect({
            names: s.filteredName.result.map((application) => application.name),
            per_page: s.filteredName.result_info.per_page,
          }).toEqual({ names: ['audit-agent'], per_page: 1 })
        ),
        When('the listing is filtered by a name nothing uses')(
          'filteredEmpty',
          () => listApplications({ name: 'nothing-matches' }),
        ),
        Then('the name filter selects nothing')((s, expect) =>
          expect(s.filteredEmpty.result.map((application) => application.name)).toEqual([])
        ),
        When('the application is read by id')('read', (s) => getApplication(s.created.result.id)),
        Then('the read repeats the created application')((s, expect) =>
          expect({
            name: s.read.result.name,
            namespace_id: s.read.result.durable_objects?.namespace_id ?? 'absent',
          }).toEqual({ name: 'audit-agent', namespace_id: s.created.result.durable_objects?.namespace_id ?? 'absent' })
        ),
        When('the application is patched with an SSH key and enabled logs')(
          'patched',
          (s) =>
            modifyApplication(s.created.result.id, {
              configuration: { authorized_keys: [{ public_key: 'ssh-rsa AAAA' }], wrangler_ssh: { enabled: true } },
              observability: { logs: { enabled: true } },
            }),
        ),
        Then('the SSH configuration and logs are stored')((s, expect) =>
          expect({
            keys: s.patched.result.configuration?.authorized_keys?.length ?? 0,
            logs_enabled: s.patched.result.observability?.logs?.enabled ?? 'absent',
          }).toEqual({ keys: 1, logs_enabled: true })
        ),
        When('an application that was never created is read')(
          'missingRead',
          () => observed(getApplication(UNKNOWN_APPLICATION)),
        ),
        Then('the read is refused as not found')((s, expect) =>
          expect(s.missingRead).toEqual({
            code: 10006,
            kind: 'NotFound',
            message: 'Application not found.',
            retryAfter: null,
          })
        ),
        When('an application that was never created is patched')(
          'missingPatch',
          () => observed(modifyApplication(UNKNOWN_APPLICATION, { observability: { logs: { enabled: false } } })),
        ),
        Then('the patch is refused as not found')((s, expect) =>
          expect(s.missingPatch).toEqual({
            code: 10006,
            kind: 'NotFound',
            message: 'Application not found.',
            retryAfter: null,
          })
        ),
        When('the application is deleted')('deleted', (s) => deleteApplication(s.created.result.id)),
        Then('the delete reports the deleted application')((s, expect) =>
          expect(s.deleted.result.message).toEqual(`Application ${s.created.result.id} deleted.`)
        ),
      ),
    )

    scenario(
      'A Durable Object application keeps an explicit namespace and a repeated delete is not found',
      Gherkin.Do.pipe(
        Given('an account with no applications')('account', () => Effect.succeed(ACCOUNT)),
        When('a Durable Object application is created with an explicit namespace')(
          'created',
          () =>
            createApplication({
              durable_objects: { namespace_id: 'namespace-42' },
              name: 'audit-explicit',
              scheduling_policy: 'durable_object',
            }),
        ),
        Then('the explicit namespace is kept')((s, expect) =>
          expect(s.created.result.durable_objects?.namespace_id ?? 'absent').toEqual('namespace-42')
        ),
        When('the application is deleted')('deleted', (s) => deleteApplication(s.created.result.id)),
        Then('the delete reports the deleted application')((s, expect) =>
          expect(s.deleted.result.message).toEqual(`Application ${s.created.result.id} deleted.`)
        ),
        When('the deleted application is read again')(
          'readAfterDelete',
          (s) => observed(getApplication(s.created.result.id)),
        ),
        Then('it is now refused as not found')((s, expect) =>
          expect(s.readAfterDelete).toEqual({
            code: 10006,
            kind: 'NotFound',
            message: 'Application not found.',
            retryAfter: null,
          })
        ),
      ),
    )
  })
