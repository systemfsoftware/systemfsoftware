import { apiTokenCredentials, Credentials } from '@distilled.cloud/cloudflare'
import { NodeServices } from '@effect/platform-node'
import { client as cloudflare } from '@systemfsoftware/alchemy-cloudflare'
import { Emulator, layer as emulatorLayer } from '@systemfsoftware/cloudflare-emulator'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Duration, Effect, Layer, Result, Schema } from 'effect'
import * as FetchHttpClient from 'effect/http/FetchHttpClient'

const Feature = makeFeature({ it })

const ZONE = 'a1b2c3d4e5f60718293a4b5c6d7e8f90'
const params = { zone_id: ZONE }

const tracing = Effect.map(cloudflare.CloudflareClient, (api) => api['Observability'])

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

const getSettings = () => Effect.flatMap(tracing, (api) => api.zoneObservabilityTracingSettingsGet({ params }))

const patchSettings = (payload: {
  readonly destinations?: ReadonlyArray<string>
  readonly enabled?: boolean
  readonly forward_context?: boolean
  readonly persist?: boolean
  readonly propagation_policy?: 'accept' | 'authenticated' | 'reject'
  readonly sampling_ratio?: number
}) => Effect.flatMap(tracing, (api) => api.zoneObservabilityTracingSettingsUpdate({ params, payload }))

const resetSettings = () => Effect.flatMap(tracing, (api) => api.zoneObservabilityTracingSettingsDelete({ params }))

const getRules = () => Effect.flatMap(tracing, (api) => api.zoneObservabilityTracingRulesGet({ params }))

const replaceRules = (
  rules: ReadonlyArray<{
    readonly action: 'set_trace_settings'
    readonly action_parameters: { readonly sampling_ratio: number }
    readonly description: string
    readonly enabled: boolean
    readonly expression: string
  }>,
) => Effect.flatMap(tracing, (api) => api.zoneObservabilityTracingRulesUpdate({ params, payload: { rules } }))

const deleteRules = () => Effect.flatMap(tracing, (api) => api.zoneObservabilityTracingRulesDelete({ params }))

const armRateLimit = (calls: number) =>
  Effect.flatMap(Emulator, (emulator) =>
    emulator.admin.armInjectedStatus({
      operation: 'zoneObservabilityTracingSettingsGet',
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

Feature('Zone tracing against the Cloudflare emulator')
  .live('drives the emulator over a real loopback HTTP socket with the generated client')
  .withScenarioLayer(clientOnEmulator)
  .body(({ scenario }) => {
    scenario(
      'A zone without stored settings answers the defaults, patch and reset around them',
      Gherkin.Do.pipe(
        Given('a zone with no tracing configuration')('zone', () => Effect.succeed(ZONE)),
        When('the tracing settings are read')('defaults', () => getSettings()),
        Then('the settings are the documented defaults')((s, expect) =>
          expect(s.defaults.result).toEqual({
            destinations: [],
            enabled: false,
            forward_context: false,
            persist: true,
            propagation_policy: 'reject',
            sampling_ratio: 1,
          })
        ),
        When('the settings are patched to enable tracing at half sampling')(
          'patched',
          () => patchSettings({ enabled: true, sampling_ratio: 0.5 }),
        ),
        Then('only the patched fields change')((s, expect) =>
          expect({
            destinations: s.patched.result.destinations,
            enabled: s.patched.result.enabled,
            forward_context: s.patched.result.forward_context,
            persist: s.patched.result.persist,
            propagation_policy: s.patched.result.propagation_policy,
            sampling_ratio: s.patched.result.sampling_ratio,
          }).toEqual({
            destinations: [],
            enabled: true,
            forward_context: false,
            persist: true,
            propagation_policy: 'reject',
            sampling_ratio: 0.5,
          })
        ),
        When('the settings are read again')('stored', () => getSettings()),
        Then('the stored settings repeat the patch')((s, expect) =>
          expect({ enabled: s.stored.result.enabled, sampling_ratio: s.stored.result.sampling_ratio }).toEqual({
            enabled: true,
            sampling_ratio: 0.5,
          })
        ),
        When('accepted propagation is requested')(
          'accepted',
          () => patchSettings({ propagation_policy: 'accept' }),
        ),
        Then('accepted propagation is stored')((s, expect) =>
          expect(s.accepted.result.propagation_policy).toEqual('accept')
        ),
        When('authenticated propagation is requested')(
          'authenticated',
          () => observed(patchSettings({ propagation_policy: 'authenticated' })),
        ),
        Then('authenticated propagation is refused by the emulator')((s, expect) =>
          expect(s.authenticated).toEqual({
            code: 1003,
            kind: 'Validation',
            message: 'Authenticated propagation is not supported yet.',
            retryAfter: null,
          })
        ),
        When('the settings are reset')('reset', () => resetSettings()),
        Then('the reset restores the defaults')((s, expect) =>
          expect(s.reset.result).toEqual({
            destinations: [],
            enabled: false,
            forward_context: false,
            persist: true,
            propagation_policy: 'reject',
            sampling_ratio: 1,
          })
        ),
      ),
    )

    scenario(
      'Sampling rules are replaced, read back and deleted while the settings survive',
      Gherkin.Do.pipe(
        Given('a zone with tracing enabled at half sampling')(
          'zone',
          () =>
            Effect.gen(function*() {
              yield* patchSettings({ enabled: true, sampling_ratio: 0.5 })
              return ZONE
            }),
        ),
        When('the sampling rules are read before any replacement')('emptyRules', () => getRules()),
        Then('the zone has no sampling overrides')((s, expect) => expect(s.emptyRules.result).toEqual({ rules: [] })),
        When('one sampling rule is supplied in order')(
          'replaced',
          () =>
            replaceRules([
              {
                action: 'set_trace_settings',
                action_parameters: { sampling_ratio: 0.25 },
                description: 'trace the audit endpoint',
                enabled: true,
                expression: 'http.host contains "example.com"',
              },
            ]),
        ),
        Then('the supplied rule is stored')((s, expect) =>
          expect({
            expression: s.replaced.result.rules[0]?.expression ?? 'absent',
            rules: s.replaced.result.rules.length,
          }).toEqual({ expression: 'http.host contains "example.com"', rules: 1 })
        ),
        When('the rules are read back')('rules', () => getRules()),
        Then('the stored rule is listed')((s, expect) => expect(s.rules.result.rules.length).toEqual(1)),
        When('the rules are deleted')('deleted', () => deleteRules()),
        Then('no rules remain')((s, expect) => expect(s.deleted.result).toEqual({ rules: [] })),
        When('the settings are read after the rule deletion')('settings', () => getSettings()),
        Then('the settings the rules were replaced against survive')((s, expect) =>
          expect({
            enabled: s.settings.result.enabled,
            sampling_ratio: s.settings.result.sampling_ratio,
          }).toEqual({ enabled: true, sampling_ratio: 0.5 })
        ),
      ),
    )

    scenario(
      'A rate-limited settings read is retried by the client and an exhausted retry budget is reported',
      Gherkin.Do.pipe(
        Given('a zone with no tracing configuration')('zone', () => Effect.succeed(ZONE)),
        When('a 429 fault is armed for one call and the settings are read')(
          'retried',
          () =>
            Effect.gen(function*() {
              yield* armRateLimit(1)
              return yield* getSettings()
            }),
        ),
        Then('the client retries the rate-limited call and the settings are answered')((s, expect) =>
          expect({ enabled: s.retried.result.enabled }).toEqual({ enabled: false })
        ),
        When('a 429 fault is armed for every attempt and the settings are read again')(
          'rateLimited',
          () =>
            Effect.gen(function*() {
              yield* armRateLimit(3)
              return yield* observed(getSettings())
            }),
        ),
        Then('the read fails as rate limited with the injected retry-after')((s, expect) =>
          expect(s.rateLimited).toEqual({
            code: 429,
            kind: 'RateLimited',
            message: 'Injected 429 fault.',
            retryAfter: 0,
          })
        ),
        When('the faults are cleared and the settings are read once more')(
          'final',
          () =>
            Effect.gen(function*() {
              yield* clearFaults
              return yield* getSettings()
            }),
        ),
        Then('the settings are answered again')((s, expect) =>
          expect({ enabled: s.final.result.enabled }).toEqual({ enabled: false })
        ),
      ),
    )
  })
