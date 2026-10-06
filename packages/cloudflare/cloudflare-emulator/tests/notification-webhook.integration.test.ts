import { apiTokenCredentials, Credentials } from '@distilled.cloud/cloudflare'
import { NodeServices } from '@effect/platform-node'
import { client as cloudflare } from '@systemfsoftware/alchemy-cloudflare'
import type {
  NotificationWebhooksCreateAWebhookRequestJson as CreateWebhookPayload,
  NotificationWebhooksUpdateAWebhookRequestJson as UpdateWebhookPayload,
} from '@systemfsoftware/alchemy-cloudflare/api'
import { Emulator, layer as emulatorLayer } from '@systemfsoftware/cloudflare-emulator'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer } from 'effect'
import * as FetchHttpClient from 'effect/http/FetchHttpClient'
import { observed } from './__fixtures__/observed-refusal.fixture.js'

const Feature = makeFeature({ it })

const ACCOUNT = '0123456789abcdef0123456789abcdef'
const params = { account_id: ACCOUNT }
const MISSING_WEBHOOK = 'ffffffffffffffffffffffffffffffff'

const webhooks = Effect.map(cloudflare.CloudflareClient, (api) => api['Notification webhooks'])

const createWebhook = (payload: CreateWebhookPayload) =>
  Effect.flatMap(webhooks, (w) => w.notificationWebhooksCreateAWebhook({ params, payload }))

const listWebhooks = () => Effect.flatMap(webhooks, (w) => w.notificationWebhooksListWebhooks({ params }))

const getWebhook = (webhook_id: string) =>
  Effect.flatMap(
    webhooks,
    (w) => w.notificationWebhooksGetAWebhook({ params: { account_id: ACCOUNT, webhook_id } }),
  )

const updateWebhook = (webhook_id: string, payload: UpdateWebhookPayload) =>
  Effect.flatMap(
    webhooks,
    (w) => w.notificationWebhooksUpdateAWebhook({ params: { account_id: ACCOUNT, webhook_id }, payload }),
  )

const deleteWebhook = (webhook_id: string) =>
  Effect.flatMap(
    webhooks,
    (w) => w.notificationWebhooksDeleteAWebhook({ params: { account_id: ACCOUNT, webhook_id } }),
  )

// One URL per entry of the emulator's destination-hint table, plus a URL no
// hint matches (the generic fallback). The inferred `type` is what Cloudflare
// derives from the destination's URL.
const DESTINATION_URLS: ReadonlyArray<string> = [
  'https://discord.example/api/webhooks/1',
  'https://hooks.slack.com/services/2',
  'https://www.datadoghq.com/api/3',
  'https://api.opsgenie.com/v2/alerts/4',
  'https://splunk.example/services/collector/5',
  'https://open.feishu.cn/open-apis/bot/6',
  'https://open.larksuite.com/open-apis/bot/7',
  'https://chat.googleapis.com/v1/spaces/8',
  'https://example.com/generic/9',
]

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

Feature('Notification webhooks against the Cloudflare emulator')
  .live('drives the emulator over a real loopback HTTP socket with the generated client')
  .withScenarioLayer(clientOnEmulator)
  .body(({ scenario }) => {
    scenario(
      'A webhook is created, listed, read, updated and deleted',
      Gherkin.Do.pipe(
        Given('an account with no webhooks')('account', () => Effect.succeed(ACCOUNT)),
        When('a Discord webhook is created')(
          'created',
          () => createWebhook({ name: 'discord-hook', url: 'https://discord.example/api/webhooks/1' }),
        ),
        Then('the create answers a successful envelope with a new id')((s, expect) =>
          expect({ hasId: typeof s.created.result?.id === 'string', success: s.created.success }).toEqual({
            hasId: true,
            success: true,
          })
        ),
        When('every webhook is listed')('listed', () => listWebhooks()),
        Then('the listing carries the webhook projection with its inferred type')((s, expect) =>
          expect({
            count: s.listed.result?.length,
            created_at_is_string: typeof s.listed.result?.[0]?.created_at === 'string',
            id: s.listed.result?.[0]?.id,
            name: s.listed.result?.[0]?.name,
            type: s.listed.result?.[0]?.type,
            url: s.listed.result?.[0]?.url,
          }).toEqual({
            count: 1,
            created_at_is_string: true,
            id: s.created.result?.id,
            name: 'discord-hook',
            type: 'discord',
            url: 'https://discord.example/api/webhooks/1',
          })
        ),
        When('the webhook is read by its id')('read', (s) => getWebhook(s.created.result?.id ?? MISSING_WEBHOOK)),
        Then('the read repeats the created webhook')((s, expect) =>
          expect({
            created_at: s.read.result?.created_at,
            id: s.read.result?.id,
            name: s.read.result?.name,
            type: s.read.result?.type,
            url: s.read.result?.url,
          }).toEqual({
            created_at: s.listed.result?.[0]?.created_at,
            id: s.created.result?.id,
            name: 'discord-hook',
            type: 'discord',
            url: 'https://discord.example/api/webhooks/1',
          })
        ),
        When('the webhook is renamed and pointed at Slack')(
          'updated',
          (s) =>
            updateWebhook(s.created.result?.id ?? MISSING_WEBHOOK, {
              name: 'renamed-hook',
              url: 'https://hooks.slack.com/services/abc',
            }),
        ),
        When('the updated webhook is read back')(
          'updatedRead',
          (s) => getWebhook(s.created.result?.id ?? MISSING_WEBHOOK),
        ),
        Then('the name and url changed, the type followed the url, and the creation date is preserved')(
          (s, expect) =>
            expect({
              created_at: s.updatedRead.result?.created_at,
              id: s.updatedRead.result?.id,
              name: s.updatedRead.result?.name,
              type: s.updatedRead.result?.type,
              url: s.updatedRead.result?.url,
            }).toEqual({
              created_at: s.read.result?.created_at,
              id: s.created.result?.id,
              name: 'renamed-hook',
              type: 'slack',
              url: 'https://hooks.slack.com/services/abc',
            }),
        ),
        When('the webhook is deleted')('deleted', (s) => deleteWebhook(s.created.result?.id ?? MISSING_WEBHOOK)),
        Then('the delete answers a successful envelope with an empty result')((s, expect) =>
          // Aaa_api_response_common_2 declares no `result`, only an index signature.
          expect({ result: s.deleted['result'], success: s.deleted.success }).toEqual({ result: {}, success: true })
        ),
      ),
    )

    scenario(
      'Every destination URL is stamped with the webhook type Cloudflare infers',
      Gherkin.Do.pipe(
        Given('an account with no webhooks')('account', () => Effect.succeed(ACCOUNT)),
        When('a webhook is created for every known destination URL')(
          'created',
          () => Effect.forEach(DESTINATION_URLS, (url, index) => createWebhook({ name: `hook-${index}`, url })),
        ),
        When('every webhook is listed')('listed', () => listWebhooks()),
        Then('the listing stamps each webhook with its inferred type')((s, expect) =>
          expect({
            count: s.created.length,
            types: s.listed.result?.map((webhook) => webhook.type),
          }).toEqual({
            count: 9,
            types: ['discord', 'slack', 'datadog', 'opsgenie', 'splunk', 'feishu', 'feishu', 'gchat', 'generic'],
          })
        ),
      ),
    )

    scenario(
      'Missing webhooks are not found and undecodable bodies are refused',
      Gherkin.Do.pipe(
        Given('an account with no webhooks')('account', () => Effect.succeed(ACCOUNT)),
        When('a webhook that was never created is read')(
          'missingRead',
          () => observed(getWebhook(MISSING_WEBHOOK)),
        ),
        Then('the read is refused as not found with the webhook code')((s, expect) =>
          expect(s.missingRead).toEqual({
            code: 0,
            kind: 'NotFound',
            message: 'Webhook not found.',
            retryAfter: null,
          })
        ),
        When('a webhook that was never created is updated')(
          'missingUpdate',
          () => observed(updateWebhook(MISSING_WEBHOOK, { name: 'other', url: 'https://example.com/x' })),
        ),
        Then('the update is refused as not found')((s, expect) =>
          expect(s.missingUpdate).toEqual({
            code: 0,
            kind: 'NotFound',
            message: 'Webhook not found.',
            retryAfter: null,
          })
        ),
        When('a create sends a body that is not a webhook object')(
          'badCreate',
          () => observed(createWebhook('not-a-webhook')),
        ),
        Then('the create body is refused with the emulator 400 envelope')((s, expect) =>
          expect(s.badCreate).toEqual({
            code: 1000,
            kind: 'Validation',
            message: 'Invalid request body.',
            retryAfter: null,
          })
        ),
        When('an update sends a body that is not a webhook object')(
          'badUpdate',
          () => observed(updateWebhook(MISSING_WEBHOOK, 'not-a-webhook')),
        ),
        Then('the update body is refused with the emulator 400 envelope')((s, expect) =>
          expect(s.badUpdate).toEqual({
            code: 1000,
            kind: 'Validation',
            message: 'Invalid request body.',
            retryAfter: null,
          })
        ),
      ),
    )
  })
