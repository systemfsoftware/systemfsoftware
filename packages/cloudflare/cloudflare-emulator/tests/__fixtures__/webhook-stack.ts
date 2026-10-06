/**
 * An Alchemy stack with one notification webhook, deployed and destroyed by the
 * real `alchemy` CLI against the emulator. Credentials come from distilled's
 * environment reader, which honours `CLOUDFLARE_API_BASE_URL`; Alchemy's stock
 * Cloudflare provider layer always calls api.cloudflare.com. Retries are off, so
 * a 500 reaches Alchemy's own read-back at once instead of after distilled's
 * backoff.
 */
import { fromEnv } from '@distilled.cloud/cloudflare/Credentials'
import { Retry } from '@distilled.cloud/cloudflare/Retry'
import { localState, Stack } from 'alchemy'
import * as Cloudflare from 'alchemy/Cloudflare'
import * as Provider from 'alchemy/Provider'
import { Config, Effect, Layer, Redacted } from 'effect'
import * as FetchHttpClient from 'effect/http/FetchHttpClient'

const environment = Layer.effect(
  Cloudflare.CloudflareEnvironment,
  Effect.map(
    Config.all({ accountId: Config.String('CLOUDFLARE_ACCOUNT_ID'), apiToken: Config.String('CLOUDFLARE_API_TOKEN') }),
    (env) =>
      Effect.succeed({
        type: 'apiToken' as const,
        apiToken: Redacted.make(env.apiToken),
        accountId: env.accountId,
        source: { type: 'env' as const },
      }),
  ),
)

const providers = Layer.effect(
  Cloudflare.Providers,
  Provider.collection([Cloudflare.Alerting.NotificationWebhook]),
).pipe(
  Layer.provideMerge(Cloudflare.Alerting.NotificationWebhookProvider()),
  Layer.provideMerge(
    Layer.mergeAll(fromEnv(), environment, FetchHttpClient.layer, Layer.succeed(Retry, { while: () => false })),
  ),
  Layer.orDie,
)

export default Stack(
  'webhook-delete',
  { providers, state: localState() },
  Effect.gen(function*() {
    const webhook = yield* Cloudflare.Alerting.NotificationWebhook('AlertsHook', {
      name: 'alerts',
      url: 'https://alerts.example.com/cf',
    })
    return { webhookId: webhook.webhookId }
  }),
)
