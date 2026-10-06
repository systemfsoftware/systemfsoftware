import { apiTokenCredentials, Credentials } from '@distilled.cloud/cloudflare'
import { NodeServices } from '@effect/platform-node'
import { client as cloudflare } from '@systemfsoftware/alchemy-cloudflare'
import type { Spectrum_config_update_app_config } from '@systemfsoftware/alchemy-cloudflare/api'
import { Emulator, layer as emulatorLayer } from '@systemfsoftware/cloudflare-emulator'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer } from 'effect'
import * as FetchHttpClient from 'effect/http/FetchHttpClient'
import { observed } from './__fixtures__/observed-refusal.fixture.js'

const Feature = makeFeature({ it })

const ZONE = 'fedcba9876543210fedcba9876543210'
const UNKNOWN_APP = 'ffffffffffffffffffffffffffffffff'
const ORIGIN = 'origin.example.com'
const UPDATED_ORIGIN = 'updated.example.com'

// The emulator's current refusal messages, asserted verbatim until the
// live-capture lane replaces uncited codes; never derived from a run.
const INVALID_BODY = 'The Spectrum application configuration is invalid.'
const DNS_NAME = 'The application requires a DNS name.'
const WORKER_ORIGIN =
  'A Worker origin is mutually exclusive with origin_direct, origin_dns, origin_port, proxy_protocol, and argo_smart_routing; it requires a tcp protocol and allows tls only "off" or "flexible".'
const IDENTITY_TAKEN = 'An application with the same DNS name and protocol already exists in this zone.'
const NOT_FOUND = 'Spectrum application not found.'
const ENTITLEMENT = 'Spectrum is not available for this account.'

// Cloudflare's generated payload requires the read-only timestamps and the id,
// so every create/update literal carries them; the emulator ignores them.
const base: Spectrum_config_update_app_config = {
  created_on: '',
  dns: { name: ORIGIN },
  id: '',
  modified_on: '',
  protocol: 'tcp/8080',
}

const spectrum = Effect.map(cloudflare.CloudflareClient, (api) => api['Spectrum Applications'])

const listApps = () =>
  Effect.flatMap(
    spectrum,
    (s) => s.spectrumApplicationsListSpectrumApplications({ params: { zone_id: ZONE }, query: {} }),
  )

const listAppsPaged = (page: number, per_page: number) =>
  Effect.flatMap(
    spectrum,
    (s) => s.spectrumApplicationsListSpectrumApplications({ params: { zone_id: ZONE }, query: { page, per_page } }),
  )

const createApp = (payload: Spectrum_config_update_app_config) =>
  Effect.flatMap(
    spectrum,
    (s) =>
      s.spectrumApplicationsCreateSpectrumApplicationUsingANameForTheOrigin({ params: { zone_id: ZONE }, payload }),
  )

const getApp = (app_id: string) =>
  Effect.flatMap(
    spectrum,
    (s) => s.spectrumApplicationsGetSpectrumApplicationConfiguration({ params: { app_id, zone_id: ZONE } }),
  )

const updateApp = (app_id: string, payload: Spectrum_config_update_app_config) =>
  Effect.flatMap(
    spectrum,
    (s) =>
      s.spectrumApplicationsUpdateSpectrumApplicationConfigurationUsingANameForTheOrigin({
        params: { app_id, zone_id: ZONE },
        payload,
      }),
  )

const deleteApp = (app_id: string) =>
  Effect.flatMap(
    spectrum,
    (s) => s.spectrumApplicationsDeleteSpectrumApplication({ params: { app_id, zone_id: ZONE } }),
  )

const seedSpectrum = (entitled: boolean) =>
  Effect.flatMap(Emulator, (emulator) => emulator.admin.seedEntitlement({ product: 'spectrum', entitled }))

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

Feature('Spectrum applications against the Cloudflare emulator')
  .live('drives the emulator over a real loopback HTTP socket with the generated client')
  .withScenarioLayer(clientOnEmulator)
  .body(({ scenario }) => {
    scenario(
      'An application is created, read, listed, updated, then deleted and gone',
      Gherkin.Do.pipe(
        Given('a zone with no Spectrum applications')('setup', () => Effect.succeed({ ZONE })),
        When('an application for a DNS name is created')('created', () => createApp(base)),
        Then('the created application decodes with its DNS name and protocol')((s, expect) =>
          expect({ dns: s.created.result?.dns.name, protocol: s.created.result?.protocol }).toEqual({
            dns: ORIGIN,
            protocol: 'tcp/8080',
          })
        ),
        When('the application is read by its id')('read', (s) => getApp(s.created.result?.id ?? UNKNOWN_APP)),
        Then('the read application answers the same DNS name')((s, expect) =>
          expect(s.read.result?.dns.name).toEqual(ORIGIN)
        ),
        When('every application in the zone is listed')('listed', () => listApps()),
        Then('the zone lists the created application')((s, expect) =>
          expect(s.listed.result?.map((app) => ({ dns: app.dns.name, protocol: app.protocol }))).toEqual([
            { dns: ORIGIN, protocol: 'tcp/8080' },
          ])
        ),
        When('the zone is listed with an explicit page and size')('paged', () => listAppsPaged(2, 5)),
        Then('the listing echoes the requested page and size')((s, expect) =>
          expect({
            page: s.paged.result_info?.page,
            per_page: s.paged.result_info?.per_page,
            total_count: s.paged.result_info?.total_count,
          }).toEqual({ page: 2, per_page: 5, total_count: 1 })
        ),
        When('the application is updated to a new DNS name')(
          'updated',
          (s) => updateApp(s.created.result?.id ?? UNKNOWN_APP, { ...base, dns: { name: UPDATED_ORIGIN } }),
        ),
        Then('the update answers the new DNS name')((s, expect) =>
          expect({ dns: s.updated.result?.dns.name, protocol: s.updated.result?.protocol }).toEqual({
            dns: UPDATED_ORIGIN,
            protocol: 'tcp/8080',
          })
        ),
        When('the application is deleted')('removed', (s) => deleteApp(s.created.result?.id ?? UNKNOWN_APP)),
        Then('the delete succeeds and answers an id')((s, expect) =>
          expect({ idKind: typeof s.removed.result?.id, success: s.removed.success }).toEqual({
            idKind: 'string',
            success: true,
          })
        ),
        When('the deleted application is read')('gone', (s) => observed(getApp(s.created.result?.id ?? UNKNOWN_APP))),
        Then('the read is not found')((s, expect) =>
          expect(s.gone).toEqual({ code: 10006, kind: 'NotFound', message: NOT_FOUND, retryAfter: null })
        ),
        When('the zone is listed again')('emptied', () => listApps()),
        Then('the zone lists no applications')((s, expect) =>
          expect(s.emptied.result?.map((app) => app.dns.name)).toEqual([])
        ),
      ),
    )

    scenario(
      'Invalid bodies, a taken identity and a missing application are refused',
      Gherkin.Do.pipe(
        Given('a zone with no Spectrum applications')('setup', () => Effect.succeed({ ZONE })),
        When('an application carrying an unknown traffic type is created')(
          'invalidBody',
          () => observed(createApp({ ...base, traffic_type: 'bogus' })),
        ),
        Then('the unknown traffic type is refused as an invalid body')((s, expect) =>
          expect(s.invalidBody).toEqual({ code: 1003, kind: 'Validation', message: INVALID_BODY, retryAfter: null })
        ),
        When('an application with no DNS name is created')('noName', () => observed(createApp({ ...base, dns: {} }))),
        Then('the missing DNS name is refused as an invalid body')((s, expect) =>
          expect(s.noName).toEqual({ code: 1003, kind: 'Validation', message: DNS_NAME, retryAfter: null })
        ),
        When('a worker-origin application without a worker id is created')(
          'workerOrigin',
          () => observed(createApp({ ...base, traffic_type: 'worker' })),
        ),
        Then('the worker-origin mismatch is refused as an invalid body')((s, expect) =>
          expect(s.workerOrigin).toEqual({ code: 1003, kind: 'Validation', message: WORKER_ORIGIN, retryAfter: null })
        ),
        When('a valid application is created')('created', () => createApp(base)),
        Then('it is created with its DNS name')((s, expect) => expect(s.created.result?.dns.name).toEqual(ORIGIN)),
        When('a second application with the same name and protocol is created')(
          'taken',
          () => observed(createApp(base)),
        ),
        Then('the duplicate identity is refused as already existing')((s, expect) =>
          expect(s.taken).toEqual({ code: 1003, kind: 'AlreadyExists', message: IDENTITY_TAKEN, retryAfter: null })
        ),
        When('an application that was never created is read')('missing', () => observed(getApp(UNKNOWN_APP))),
        Then('the read is not found')((s, expect) =>
          expect(s.missing).toEqual({ code: 10006, kind: 'NotFound', message: NOT_FOUND, retryAfter: null })
        ),
      ),
    )

    scenario(
      'Reading a zone is refused while Spectrum is not entitled and accepted once granted',
      Gherkin.Do.pipe(
        Given('a zone whose Spectrum entitlement is withheld')(
          'setup',
          () => Effect.as(seedSpectrum(false), { ZONE }),
        ),
        When('the zone is listed')('ungranted', () => observed(listApps())),
        Then('the listing is refused as a pending entitlement')((s, expect) =>
          expect(s.ungranted).toEqual({ code: 1000, kind: 'Validation', message: ENTITLEMENT, retryAfter: null })
        ),
        When('the entitlement is granted and an application is created')(
          'granted',
          () => Effect.andThen(seedSpectrum(true), createApp(base)),
        ),
        Then('the granted create answers the DNS name')((s, expect) =>
          expect(s.granted.result?.dns.name).toEqual(ORIGIN)
        ),
      ),
    )

    scenario(
      'Updating and deleting an application that does not exist is not found',
      Gherkin.Do.pipe(
        Given('a zone with no Spectrum applications')('setup', () => Effect.succeed({ ZONE })),
        When('an application that was never created is updated')(
          'updateMissing',
          () => observed(updateApp(UNKNOWN_APP, base)),
        ),
        Then('the update is not found')((s, expect) =>
          expect(s.updateMissing).toEqual({ code: 10006, kind: 'NotFound', message: NOT_FOUND, retryAfter: null })
        ),
        When('an application that was never created is deleted')(
          'deleteMissing',
          () => observed(deleteApp(UNKNOWN_APP)),
        ),
        Then('the delete is not found')((s, expect) =>
          expect(s.deleteMissing).toEqual({ code: 10006, kind: 'NotFound', message: NOT_FOUND, retryAfter: null })
        ),
      ),
    )
  })
