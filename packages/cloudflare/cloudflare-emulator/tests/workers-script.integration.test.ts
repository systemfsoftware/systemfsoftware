import { apiTokenCredentials, Credentials } from '@distilled.cloud/cloudflare'
import { NodeServices } from '@effect/platform-node'
import { client as cloudflare } from '@systemfsoftware/alchemy-cloudflare'
import { Emulator, layer as emulatorLayer } from '@systemfsoftware/cloudflare-emulator'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer } from 'effect'
import * as FetchHttpClient from 'effect/http/FetchHttpClient'

const Feature = makeFeature({ it })

const ACCOUNT = '0123456789abcdef0123456789abcdef'
const SCRIPT = 'issues-worker'
const params = { account_id: ACCOUNT, script_name: SCRIPT }

// Hand-written from Cloudflare's multipart upload metadata documentation, never
// computed by the emulator under test.
const OBSERVABILITY = {
  enabled: true,
  head_sampling_rate: 0.5,
  issues: { enabled: true },
  logs: { enabled: true, invocation_logs: true, head_sampling_rate: 0, persist: false },
  traces: { enabled: false, head_sampling_rate: 0.1, persist: false },
}

const METADATA = JSON.stringify({
  annotations: { 'workers/message': 'integration', 'workers/tag': 'v1' },
  bindings: [{ type: 'plain_text', name: 'PRESERVED', text: 'issues-preservation' }],
  compatibility_date: '2024-01-01',
  compatibility_flags: ['nodejs_als'],
  limits: { cpu_ms: 50 },
  logpush: true,
  main_module: 'worker.js',
  observability: OBSERVABILITY,
  tags: ['issues-preservation'],
  usage_model: 'standard',
})

const uploadForm = () => {
  const form = new FormData()
  form.append('metadata', METADATA)
  form.append(
    'worker.js',
    new File(['export default { fetch() { return new Response("ok"); } };'], 'worker.js', {
      type: 'application/javascript+module',
    }),
  )
  return form
}

const workerScripts = Effect.map(cloudflare.CloudflareClient, (api) => api['Worker Script'])

const upload = Effect.flatMap(
  workerScripts,
  (scripts) => scripts.workerScriptUploadWorkerModule({ params, query: {}, payload: uploadForm() }),
)

const readSettings = Effect.flatMap(workerScripts, (scripts) => scripts.workerScriptGetSettings({ params }))

const listScripts = Effect.flatMap(
  workerScripts,
  (scripts) => scripts.workerScriptListWorkers({ params: { account_id: ACCOUNT }, query: {} }),
)

const uploadAndRead = Effect.gen(function*() {
  const uploaded = yield* upload
  const settings = yield* readSettings
  return { uploaded: uploaded.result, settings: settings.result }
})

const turnIssuesOff = Effect.gen(function*() {
  const scripts = yield* workerScripts
  yield* scripts.workerScriptSettingsPatchSettings({
    params,
    payload: { observability: { ...OBSERVABILITY, issues: { enabled: false } } },
  })
  return (yield* readSettings).result
})

const redeploy = Effect.map(upload, (response) => response.result)

const routeOnWorkersDev = Effect.gen(function*() {
  const scripts = yield* workerScripts
  const before = yield* scripts.workerScriptGetSubdomain({ params })
  const posted = yield* scripts.workerScriptPostSubdomain({
    params,
    payload: { enabled: true, previews_enabled: true },
  })
  const after = yield* scripts.workerScriptGetSubdomain({ params })
  return { before: before.result.enabled, posted: posted.result, after: after.result }
})

const destroy = Effect.gen(function*() {
  const scripts = yield* workerScripts
  const listed = yield* listScripts
  yield* scripts.workerScriptDeleteWorker({ params, query: { force: true } })
  const remaining = yield* listScripts
  return {
    before: listed.result.map((script) => script.id),
    after: remaining.result.map((script) => script.id),
  }
})

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

Feature('Deploying a minimal Worker against the Cloudflare emulator')
  .live("serves the emulator on a loopback port and drives it with the client generated from Cloudflare's schema")
  .withLayer(clientOnEmulator)
  .body(({ scenario }) => {
    scenario(
      'A Worker is uploaded, patched, redeployed unchanged, exposed on workers.dev and destroyed',
      Gherkin.Do.pipe(
        Given('a module Worker whose metadata turns Issues on')(
          'script',
          () => Effect.succeed(SCRIPT),
        ),
        When('it is uploaded and its settings are read')('deployed', () => uploadAndRead),
        Then('the settings carry the uploaded configuration, with caching at its documented default')((s, expect) =>
          expect({
            entry_point: s.deployed.uploaded.entry_point,
            has_modules: s.deployed.uploaded.has_modules,
            bindings: s.deployed.settings.bindings,
            cache_options: s.deployed.settings.cache_options,
            compatibility_date: s.deployed.settings.compatibility_date,
            compatibility_flags: s.deployed.settings.compatibility_flags,
            issues: s.deployed.settings.observability?.issues,
            limits: s.deployed.settings.limits,
            logpush: s.deployed.settings.logpush,
            tags: s.deployed.settings.tags,
            usage_model: s.deployed.settings.usage_model,
          }).toEqual({
            entry_point: 'worker.js',
            has_modules: true,
            bindings: [{ type: 'plain_text', name: 'PRESERVED', text: 'issues-preservation' }],
            cache_options: { cross_version_cache: false, enabled: false },
            compatibility_date: '2024-01-01',
            compatibility_flags: ['nodejs_als'],
            issues: { enabled: true },
            limits: { cpu_ms: 50 },
            logpush: true,
            tags: ['issues-preservation'],
            usage_model: 'standard',
          })
        ),
        When('its observability is patched to turn Issues off')('patched', () => turnIssuesOff),
        Then('Issues are off and bindings, tags, limits and compatibility are untouched')((s, expect) =>
          expect({
            bindings: s.patched.bindings,
            compatibility_date: s.patched.compatibility_date,
            issues: s.patched.observability?.issues,
            limits: s.patched.limits,
            logpush: s.patched.logpush,
            tags: s.patched.tags,
          }).toEqual({
            bindings: [{ type: 'plain_text', name: 'PRESERVED', text: 'issues-preservation' }],
            compatibility_date: '2024-01-01',
            issues: { enabled: false },
            limits: { cpu_ms: 50 },
            logpush: true,
            tags: ['issues-preservation'],
          })
        ),
        When('the same Worker is uploaded again unchanged')('redeployed', () => redeploy),
        Then("the second upload repeats the first one's etag and creation time")((s, expect) =>
          expect({ created_on: s.redeployed.created_on, etag: s.redeployed.etag }).toEqual({
            created_on: s.deployed.uploaded.created_on,
            etag: s.deployed.uploaded.etag,
          })
        ),
        When('it is given a workers.dev route')('routed', () => routeOnWorkersDev),
        Then('it started off workers.dev and the route it was given is read back')((s, expect) =>
          expect(s.routed).toEqual({
            before: false,
            posted: { enabled: true, previews_enabled: true },
            after: { enabled: true, previews_enabled: true },
          })
        ),
        When('it is deleted')('destroyed', () => destroy),
        Then('it is listed while it exists and gone once deleted')((s, expect) =>
          expect(s.destroyed).toEqual({ before: [SCRIPT], after: [] })
        ),
      ),
    )
  })
