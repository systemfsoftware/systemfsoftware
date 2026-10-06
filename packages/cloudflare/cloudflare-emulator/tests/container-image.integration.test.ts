import { apiTokenCredentials, Credentials } from '@distilled.cloud/cloudflare'
import { NodeServices } from '@effect/platform-node'
import { client as cloudflare } from '@systemfsoftware/alchemy-cloudflare'
import { Emulator, layer as emulatorLayer } from '@systemfsoftware/cloudflare-emulator'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer } from 'effect'
import * as FetchHttpClient from 'effect/http/FetchHttpClient'
import { observed } from './__fixtures__/observed-refusal.fixture.js'

const Feature = makeFeature({ it })

const ACCOUNT = '0123456789abcdef0123456789abcdef'
const params = { account_id: ACCOUNT }
const PINNED = `busybox@sha256:${'a'.repeat(64)}`
const DIGEST = `sha256:${'a'.repeat(64)}`

const images = Effect.map(cloudflare.CloudflareClient, (api) => api['Container Images'])

const prepareImage = (image: string) =>
  Effect.flatMap(images, (api) => api.prepareContainerImage({ params, payload: { image } }))

const armRateLimit = (calls: number) =>
  Effect.flatMap(Emulator, (emulator) =>
    emulator.admin.armInjectedStatus({
      operation: 'prepareContainerImage',
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

Feature('Container images against the Cloudflare emulator')
  .live('drives the emulator over a real loopback HTTP socket with the generated client')
  .withScenarioLayer(clientOnEmulator)
  .body(({ scenario }) => {
    scenario(
      'A digest-pinned image starts pending, is observed ready and refuses an unpinned tag',
      Gherkin.Do.pipe(
        Given('an account with no prepared images')('account', () => Effect.succeed(ACCOUNT)),
        When('a digest-pinned image is prepared for the first time')(
          'started',
          () => prepareImage(PINNED),
        ),
        Then('the preparation starts pending without an artifact digest')((s, expect) =>
          expect({
            artifact_digest: s.started.result.artifact_digest ?? 'absent',
            image: s.started.result.image,
            status: s.started.result.status,
          }).toEqual({ artifact_digest: 'absent', image: PINNED, status: 'pending' })
        ),
        When('the same image is prepared again while the first preparation is in flight')(
          'observed',
          () => prepareImage(PINNED),
        ),
        Then('the second preparation reports the image ready with its artifact digest')((s, expect) =>
          expect({
            artifact_digest: s.observed.result.artifact_digest ?? 'absent',
            image: s.observed.result.image,
            status: s.observed.result.status,
          }).toEqual({ artifact_digest: DIGEST, image: PINNED, status: 'ready' })
        ),
        When('an image that is only tagged is prepared')(
          'unpinned',
          () => observed(prepareImage('busybox:latest')),
        ),
        Then('the unpinned image is refused as a validation failure')((s, expect) =>
          expect(s.unpinned).toEqual({
            code: 1000,
            kind: 'Validation',
            message: 'Image must be digest-pinned (name@sha256:<64 hex>).',
            retryAfter: null,
          })
        ),
      ),
    )

    scenario(
      'A rate-limited preparation is retried by the client and an exhausted retry budget is reported',
      Gherkin.Do.pipe(
        Given('an account with no prepared images')('account', () => Effect.succeed(ACCOUNT)),
        When('a 429 fault is armed for one call and an image is prepared')(
          'retried',
          () =>
            Effect.gen(function*() {
              yield* armRateLimit(1)
              return yield* prepareImage(PINNED)
            }),
        ),
        Then('the client retries the rate-limited call and the preparation is started')((s, expect) =>
          expect(s.retried.result.status).toEqual('pending')
        ),
        When('a 429 fault is armed for every attempt and another image is prepared')(
          'rateLimited',
          () =>
            Effect.gen(function*() {
              yield* armRateLimit(3)
              return yield* observed(prepareImage(PINNED))
            }),
        ),
        Then('the preparation fails as rate limited with the injected retry-after')((s, expect) =>
          expect(s.rateLimited).toEqual({
            code: 429,
            kind: 'RateLimited',
            message: 'Injected 429 fault.',
            retryAfter: 0,
          })
        ),
        When('the faults are cleared and the image is prepared once more')(
          'final',
          () =>
            Effect.gen(function*() {
              yield* clearFaults
              return yield* prepareImage(PINNED)
            }),
        ),
        Then('the preparation is observed ready')((s, expect) => expect(s.final.result.status).toEqual('ready')),
      ),
    )
  })
