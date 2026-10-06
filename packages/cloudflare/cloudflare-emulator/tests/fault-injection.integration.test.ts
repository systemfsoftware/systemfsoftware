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
const ZONE = 'fedcba9876543210fedcba9876543210'

const CHECK_ZONE = 'monetizationCheckZoneEligibility'
const GET_ZONE = 'monetizationGetZoneEligibility'
const CHECK_ACCOUNT = 'monetizationCheckAccountEligibility'

const monetization = Effect.map(cloudflare.CloudflareClient, (api) => api['Monetization'])

const checkZone = () =>
  Effect.flatMap(monetization, (m) => m.monetizationCheckZoneEligibility({ params: { zone_id: ZONE } }))

const getZone = () =>
  Effect.flatMap(monetization, (m) => m.monetizationGetZoneEligibility({ params: { zone_id: ZONE } }))

const checkAccount = () =>
  Effect.flatMap(
    monetization,
    (m) =>
      m.monetizationCheckAccountEligibility({
        params: { account_id: ACCOUNT },
        payload: { acceptedTermsOfService: true },
      }),
  )

const getAccount = () =>
  Effect.flatMap(monetization, (m) => m.monetizationGetAccountEligibility({ params: { account_id: ACCOUNT } }))

const armInjected = (operation: string, status: number, retryAfterSeconds: number, calls: number) =>
  Effect.flatMap(
    Emulator,
    (emulator) => emulator.admin.armInjectedStatus({ calls, operation, retryAfterSeconds, status }),
  )

const armReset = (operation: string, calls: number) =>
  Effect.flatMap(Emulator, (emulator) => emulator.admin.armCommitThenReset({ calls, operation }))

const armHidden = (operation: string, reads: number) =>
  Effect.flatMap(Emulator, (emulator) => emulator.admin.armVisibilityWindow({ operation, reads }))

const clearFaults = Effect.flatMap(Emulator, (emulator) => emulator.admin.clearFaults)

const writeCount = (operation: string) =>
  Effect.flatMap(Emulator, (emulator) => emulator.admin.writeCount({ operation }))

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

Feature('Fault injection through the Cloudflare emulator')
  .live('drives the emulator over a real loopback HTTP socket with the generated client')
  .withScenarioLayer(clientOnEmulator)
  .body(({ scenario }) => {
    scenario(
      'An injected 429 is retried, exhausts the client budget, and stops once the faults are cleared',
      Gherkin.Do.pipe(
        Given('a zone with no monetization state and no faults')('setup', () => Effect.succeed({ ZONE })),
        When('a 429 is injected with a retry-after for every attempt and the zone is checked')(
          'limited',
          () => Effect.andThen(armInjected(CHECK_ZONE, 429, 1, 3), observed(checkZone())),
        ),
        Then('the client exhausts its retries and reports the injected rate limit')((s, expect) =>
          expect(s.limited).toEqual({ code: 429, kind: 'RateLimited', message: 'Injected 429 fault.', retryAfter: 1 })
        ),
        When('the faults are cleared and the zone is checked')(
          'recovered',
          () => Effect.andThen(clearFaults, checkZone()),
        ),
        Then('the cleared check is approved and enabled')((s, expect) =>
          expect({ enabled: s.recovered.result.enabled, status: s.recovered.result.status }).toEqual({
            enabled: true,
            status: 'approved',
          })
        ),
        When('the zone is checked a second time')('second', () => checkZone()),
        Then('the second check is approved')((s, expect) => expect(s.second.result.status).toEqual('approved')),
        When('the write count for the check operation is read')('writes', () => writeCount(CHECK_ZONE)),
        Then('both successful checks were counted')((s, expect) => expect(s.writes).toEqual(2)),
      ),
    )

    scenario(
      'A visibility window hides a stored object for its reads and then reveals it',
      Gherkin.Do.pipe(
        Given('a zone whose eligibility has been checked')(
          'setup',
          () => Effect.andThen(checkZone(), Effect.succeed({ ZONE })),
        ),
        When('a one-window hide is armed for two reads and the zone is read')(
          'hiddenOne',
          () => Effect.andThen(armHidden(GET_ZONE, 2), observed(getZone())),
        ),
        Then('the first read is hidden as not found')((s, expect) =>
          expect(s.hiddenOne).toEqual({
            code: 10006,
            kind: 'NotFound',
            message: 'The object is not visible yet.',
            retryAfter: null,
          })
        ),
        When('the zone is read again within the window')('hiddenTwo', () => observed(getZone())),
        Then('the second read is still hidden')((s, expect) =>
          expect(s.hiddenTwo).toEqual({
            code: 10006,
            kind: 'NotFound',
            message: 'The object is not visible yet.',
            retryAfter: null,
          })
        ),
        When('the zone is read after the window is spent')('visible', () => getZone()),
        Then('the stored decision is revealed')((s, expect) => expect(s.visible.result.status).toEqual('approved')),
      ),
    )

    scenario(
      'Faults armed for the wrong direction or an exhausted budget do not fire',
      Gherkin.Do.pipe(
        Given('a zone whose eligibility has been checked')(
          'setup',
          () => Effect.andThen(checkZone(), Effect.succeed({ ZONE })),
        ),
        When('an injected status with no remaining calls is armed and the zone is read')(
          'zeroInjected',
          () => Effect.andThen(armInjected(GET_ZONE, 503, 0, 0), getZone()),
        ),
        Then('the read proceeds despite the exhausted injection')((s, expect) =>
          expect(s.zeroInjected.result.status).toEqual('approved')
        ),
        When('a commit-then-reset armed for a read is triggered by the read')(
          'resetRead',
          () => Effect.andThen(armReset(GET_ZONE, 1), getZone()),
        ),
        Then('the read proceeds because reset only fires on writes')((s, expect) =>
          expect(s.resetRead.result.status).toEqual('approved')
        ),
        When('a visibility window armed for a write is triggered by the write')(
          'hiddenWrite',
          () => Effect.andThen(armHidden(CHECK_ZONE, 1), checkZone()),
        ),
        Then('the write proceeds because hiding only fires on reads')((s, expect) =>
          expect({ enabled: s.hiddenWrite.result.enabled }).toEqual({ enabled: true })
        ),
        When('a visibility window with no remaining reads is armed and the zone is read')(
          'zeroHidden',
          () => Effect.andThen(armHidden(GET_ZONE, 0), getZone()),
        ),
        Then('the read proceeds despite the exhausted window')((s, expect) =>
          expect(s.zeroHidden.result.status).toEqual('approved')
        ),
      ),
    )

    scenario(
      'A commit-then-reset write commits its state and answers a reset while the budget lasts',
      Gherkin.Do.pipe(
        Given('an account whose eligibility has never been checked')('setup', () => Effect.succeed({ ACCOUNT })),
        When('a commit-then-reset for two calls is armed and the account is checked')(
          'resetOne',
          () => Effect.andThen(armReset(CHECK_ACCOUNT, 2), observed(checkAccount())),
        ),
        Then('the first check answers a reset rather than a stored decision')((s, expect) =>
          expect({ code: s.resetOne.code, kind: s.resetOne.kind }).toEqual({ code: 0, kind: 'SchemaError' })
        ),
        When('the account is checked again while the fault remains')('resetTwo', () => observed(checkAccount())),
        Then('the second check answers a reset too')((s, expect) =>
          expect({ code: s.resetTwo.code, kind: s.resetTwo.kind }).toEqual({ code: 0, kind: 'SchemaError' })
        ),
        When('the account eligibility is read back')('committed', () => getAccount()),
        Then('the writes committed despite the resets')((s, expect) =>
          expect(s.committed.result.status).toEqual('approved')
        ),
        When('the write count for the check operation is read')('writes', () => writeCount(CHECK_ACCOUNT)),
        Then('both reset writes were counted')((s, expect) => expect(s.writes).toEqual(2)),
        When('the account is checked once the fault budget is spent')('normal', () => checkAccount()),
        Then('the check now succeeds')((s, expect) => expect(s.normal.result.status).toEqual('approved')),
      ),
    )
  })
