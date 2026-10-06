import { apiTokenCredentials, Credentials } from '@distilled.cloud/cloudflare'
import { NodeServices } from '@effect/platform-node'
import { client as cloudflare } from '@systemfsoftware/alchemy-cloudflare'
import { type ContainerInstance, Emulator, layer as emulatorLayer } from '@systemfsoftware/cloudflare-emulator'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer } from 'effect'
import * as FetchHttpClient from 'effect/http/FetchHttpClient'
import { observed } from './__fixtures__/observed-refusal.fixture.js'

const Feature = makeFeature({ it })

const ACCOUNT = '0123456789abcdef0123456789abcdef'
const params = { account_id: ACCOUNT }
const UNKNOWN_APPLICATION = 'ffffffffffffffffffffffffffffffff'
const UNKNOWN_INSTANCE = 'b'.repeat(64)
const IMAGE = 'registry.cloudflare.com/team/audit:1'
// cc_ContainerInstanceID: slice.json fixes instance ids at 64 lowercase hex.
const SEEDED_RUNNING = 'a'.repeat(64)
const SEEDED_STOPPED = 'c'.repeat(64)
const SEEDED_UNNAMED = 'd'.repeat(64)
const SEEDED_AT = '2026-01-01T00:00:00.000Z'

const clients = Effect.map(cloudflare.CloudflareClient, (api) => ({
  applications: api['Applications'],
  instances: api['Container Instances'],
}))

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

const createSchedulerApplication = (name: string, instances: number) =>
  Effect.flatMap(
    clients,
    ({ applications }) =>
      applications.createApplication({
        params,
        payload: {
          configuration: { image: IMAGE },
          instances,
          max_instances: instances,
          name,
          scheduling_policy: 'default',
        },
      }),
  )

const seedInstance = (instance: ContainerInstance) =>
  Effect.flatMap(Emulator, (emulator) => emulator.admin.seedContainerInstance({ instance }))

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

    scenario(
      'A scheduler-backed application lists the instances its count requests and reads one by id',
      Gherkin.Do.pipe(
        Given('an account holding one scheduler-backed application requesting two instances')(
          'application',
          () => createSchedulerApplication('scheduler-audit', 2),
        ),
        When('the instances of the scheduler application are listed')(
          'listed',
          (s) => listInstances(s.application.result.id, {}),
        ),
        Then('two running instances are listed')((s, expect) =>
          expect({
            count: s.listed.result.instances.length,
            per_page: s.listed.result_info.per_page ?? 'absent',
            states: s.listed.result.instances.map((instance) => instance.status.state),
          }).toEqual({ count: 2, per_page: 2, states: ['running', 'running'] })
        ),
        When('the first listed instance is read by id')(
          'read',
          (s) => getInstance(s.application.result.id, s.listed.result.instances[0]?.id ?? 'absent'),
        ),
        Then('the read reports a running instance carrying the application image')((s, expect) =>
          // cc_ContainerInstanceID: slice.json fixes the id at 64 lowercase hex.
          expect({
            id_is_hex64: /^[0-9a-f]{64}$/.test(s.read.result.id),
            image: s.read.result.image,
            state: s.read.result.status.state,
          }).toEqual({ id_is_hex64: true, image: IMAGE, state: 'running' })
        ),
        When('the instances are filtered to active ones')(
          'active',
          (s) => listInstances(s.application.result.id, { state: 'active' }),
        ),
        Then('both running instances are active')((s, expect) =>
          expect(s.active.result.instances.map((instance) => instance.status.state)).toEqual(['running', 'running'])
        ),
        When('the instances are filtered to finished ones')(
          'notActive',
          (s) => listInstances(s.application.result.id, { state: 'not-active' }),
        ),
        Then('no running instance is finished')((s, expect) => expect(s.notActive.result.instances).toEqual([])),
        When('the instances are filtered by a name prefix')(
          'prefixed',
          (s) => listInstances(s.application.result.id, { name_prefix: 'zz', per_page: 1 }),
        ),
        Then('the unnamed instances are not selected by the prefix')((s, expect) =>
          expect({ instances: s.prefixed.result.instances, per_page: s.prefixed.result_info.per_page ?? 'absent' })
            .toEqual({ instances: [], per_page: 1 })
        ),
      ),
    )

    scenario(
      'Seeded runtime instance records drive the state and name-prefix filters',
      Gherkin.Do.pipe(
        Given('an account holding a Durable Object application with three seeded instance records')(
          'application',
          () =>
            Effect.gen(function*() {
              const application = yield* createDurableApplication('audit-agent')
              yield* seedInstance({
                application_id: application.result.id,
                id: SEEDED_RUNNING,
                image: IMAGE,
                name: 'audit-1',
                status: { state: 'running', updated_at: SEEDED_AT },
              })
              yield* seedInstance({
                application_id: application.result.id,
                id: SEEDED_STOPPED,
                image: IMAGE,
                name: 'audit-2',
                status: { state: 'stopped', updated_at: SEEDED_AT },
              })
              yield* seedInstance({
                application_id: application.result.id,
                id: SEEDED_UNNAMED,
                image: IMAGE,
                status: { state: 'running', updated_at: SEEDED_AT },
              })
              return application
            }),
        ),
        When('the instances of the application are listed')(
          'listed',
          (s) => listInstances(s.application.result.id, {}),
        ),
        Then('all three records are listed with their names and states')((s, expect) =>
          expect({
            count: s.listed.result.instances.length,
            names: s.listed.result.instances.map((instance) => instance.name ?? 'unnamed'),
            states: s.listed.result.instances.map((instance) => instance.status.state),
          }).toEqual({ count: 3, names: ['audit-1', 'audit-2', 'unnamed'], states: ['running', 'stopped', 'running'] })
        ),
        When('the instances are filtered to active ones')(
          'active',
          (s) => listInstances(s.application.result.id, { state: 'active' }),
        ),
        Then('only the running records are active')((s, expect) =>
          expect(s.active.result.instances.map((instance) => instance.status.state)).toEqual(['running', 'running'])
        ),
        When('the instances are filtered to finished ones')(
          'notActive',
          (s) => listInstances(s.application.result.id, { state: 'not-active' }),
        ),
        Then('only the stopped record is finished')((s, expect) =>
          expect(s.notActive.result.instances.map((instance) => instance.status.state)).toEqual(['stopped'])
        ),
        When('the instances are filtered by the seeded name prefix')(
          'prefixed',
          (s) => listInstances(s.application.result.id, { name_prefix: 'audit' }),
        ),
        Then('the two named records are selected and the unnamed one is not')((s, expect) =>
          expect(s.prefixed.result.instances.map((instance) => instance.name ?? 'unnamed')).toEqual([
            'audit-1',
            'audit-2',
          ])
        ),
        When('the instances are filtered by a prefix no name carries')(
          'prefixedNone',
          (s) => listInstances(s.application.result.id, { name_prefix: 'audit-9' }),
        ),
        Then('no record is selected')((s, expect) => expect(s.prefixedNone.result.instances).toEqual([])),
        When('the unnamed record is read by its id')(
          'read',
          (s) => getInstance(s.application.result.id, SEEDED_UNNAMED),
        ),
        Then('the read reports the seeded unnamed record')((s, expect) =>
          expect({
            name: s.read.result.name ?? 'unnamed',
            state: s.read.result.status.state,
          }).toEqual({ name: 'unnamed', state: 'running' })
        ),
      ),
    )
  })
