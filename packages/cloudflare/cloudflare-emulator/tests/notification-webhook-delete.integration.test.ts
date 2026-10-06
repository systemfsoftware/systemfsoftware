import { apiTokenCredentials, Credentials } from '@distilled.cloud/cloudflare'
import { NodeServices } from '@effect/platform-node'
import { client as cloudflare } from '@systemfsoftware/alchemy-cloudflare'
import { Emulator, layer as emulatorLayer } from '@systemfsoftware/cloudflare-emulator'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, FileSystem, Layer, Path } from 'effect'
import * as FetchHttpClient from 'effect/http/FetchHttpClient'
import { ChildProcess, ChildProcessSpawner } from 'effect/process'

const Feature = makeFeature({ it })

const ACCOUNT = '0123456789abcdef0123456789abcdef'
const MISSING = 'b3f1c0de00004000800000000000ffff'

// Real Cloudflare answers a delete of a missing webhook with a generic 500, code
// 15000; Alchemy 2.0.0-beta.80 records this in src/Cloudflare/Alerting/Webhook.ts:272-289.
const deleteMissing = Effect.gen(function*() {
  const api = yield* cloudflare.CloudflareClient
  return yield* api['Notification webhooks']
    .notificationWebhooksDeleteAWebhook({ params: { account_id: ACCOUNT, webhook_id: MISSING } })
    .pipe(
      Effect.as({ tag: 'Deleted', status: 200, code: 0 }),
      Effect.catchTag(
        'CloudflareApiError',
        (error) => Effect.succeed({ tag: error._tag, status: error.status, code: error.code }),
      ),
    )
})

const listWebhookIds = Effect.gen(function*() {
  const api = yield* cloudflare.CloudflareClient
  const listed = yield* api['Notification webhooks'].notificationWebhooksListWebhooks({
    params: { account_id: ACCOUNT },
  })
  return (listed.result ?? []).map((webhook) => webhook.id ?? '')
})

const alchemyCli = (command: 'deploy' | 'destroy', stateDir: string) =>
  Effect.gen(function*() {
    const emulator = yield* Emulator
    const path = yield* Path.Path
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    const bin = path.join(import.meta.dirname, '..', 'node_modules', '.bin', 'alchemy')
    const stack = path.join(import.meta.dirname, '__fixtures__', 'webhook-stack.ts')
    const alchemy = yield* spawner.spawn(
      ChildProcess.make(bin, [command, '--config', stack, '--stage', 'kiro-ci', '--yes'], {
        cwd: stateDir,
        env: {
          CLOUDFLARE_API_TOKEN: 'emulator',
          CLOUDFLARE_ACCOUNT_ID: ACCOUNT,
          CLOUDFLARE_API_BASE_URL: emulator.baseUrl,
          ALCHEMY_TELEMETRY_DISABLED: '1',
          CI: '1',
          NODE_OPTIONS: '',
        },
        extendEnv: true,
      }),
    )
    return yield* alchemy.exitCode
  })

const deployByAlchemy = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  const stateDir = yield* fs.makeTempDirectoryScoped()
  const deployExit = yield* alchemyCli('deploy', stateDir)
  const deployed = yield* listWebhookIds
  return { stateDir, deployExit, deployed }
})

const deleteOutOfBandThenDestroy = (stateDir: string, webhookIds: ReadonlyArray<string>) =>
  Effect.gen(function*() {
    const api = yield* cloudflare.CloudflareClient
    yield* Effect.forEach(webhookIds, (webhook_id) =>
      api['Notification webhooks'].notificationWebhooksDeleteAWebhook({
        params: { account_id: ACCOUNT, webhook_id },
      }))
    const destroyExit = yield* alchemyCli('destroy', stateDir)
    const remaining = yield* listWebhookIds
    return { destroyExit, remaining }
  })

const emulatorCredentials = Layer.effect(
  Credentials,
  Effect.map(
    Emulator,
    (emulator) => Effect.succeed(apiTokenCredentials({ apiToken: 'emulator', apiBaseUrl: emulator.baseUrl })),
  ),
)

const clientOnEmulator = cloudflare.CloudflareClientLive.pipe(
  Layer.provideMerge(emulatorCredentials),
  Layer.provideMerge(FetchHttpClient.layer),
  Layer.provideMerge(emulatorLayer),
  Layer.provideMerge(NodeServices.layer),
  Layer.orDie,
)

Feature('Deleting a Cloudflare notification webhook that is already gone')
  .live('serves the emulator on a loopback port and drives it with the generated client and the alchemy CLI')
  .withLayer(clientOnEmulator)
  .body(({ scenario }) => {
    scenario(
      'A delete of a missing webhook answers the 500 Cloudflare sends',
      Gherkin.Do.pipe(
        Given('a webhook id the account never had')('webhookId', () => Effect.succeed(MISSING)),
        When('it is deleted')('answer', () => deleteMissing),
        Then('the call fails with status 500 and code 15000, not a not-found')((s, expect) =>
          expect(s.answer).toEqual({ tag: 'CloudflareApiError', status: 500, code: 15000 })
        ),
      ),
    )
    scenario(
      'alchemy destroy finishes when the webhook it deployed was already deleted',
      Gherkin.Do.pipe(
        Given('a webhook deployed by alchemy deploy')('deployment', () => deployByAlchemy),
        When('it is deleted outside Alchemy and alchemy destroy runs')(
          'teardown',
          (s) => deleteOutOfBandThenDestroy(s.deployment.stateDir, s.deployment.deployed),
        ),
        Then('deploy created one webhook, destroy exits successfully, and no webhook remains')((s, expect) =>
          expect({
            deployExit: s.deployment.deployExit,
            deployed: s.deployment.deployed.length,
            destroyExit: s.teardown.destroyExit,
            remaining: s.teardown.remaining,
          }).toEqual({ deployExit: 0, deployed: 1, destroyExit: 0, remaining: [] })
        ),
      ),
    )
  })
