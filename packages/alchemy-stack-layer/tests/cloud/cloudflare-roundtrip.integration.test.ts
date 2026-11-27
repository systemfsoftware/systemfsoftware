import * as Cloudflare from '@alchemy.run/cloudflare'
import * as Core from '@alchemy.run/test/Core'
import { alchemyStack } from '@systemfsoftware/alchemy-stack-layer'
import { Gherkin, Given, it, makeFeature, sharedLayer, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import * as State from 'alchemy/State'
import { type Cause, Config, Effect, Layer, Redacted, Schedule } from 'effect'
import * as FetchHttpClient from 'effect/http/FetchHttpClient'
import * as HttpClient from 'effect/http/HttpClient'
import * as HttpClientRequest from 'effect/http/HttpClientRequest'
import { CLOUD_STACK_NAME, cloudProbeStack, probeWorkerName } from '../__fixtures__/cloudflare-stack.fixture.js'
import { PROBE_REPLY } from '../__fixtures__/probe-worker.fixture.js'

const Feature = makeFeature({ it })

const deployedStages = new Set<string>()

const deployedStage = Effect.suspend(() =>
  deployedStages.size === 1
    ? Effect.succeed([...deployedStages].join(''))
    : Effect.die(`expected one deployed stage to check, saw [${[...deployedStages].join(', ')}]`)
)

const onCloudEngine: <A>(
  effect: Effect.Effect<A, State.StateStoreError, State.State>,
  options: Core.MakeOptions,
) => Effect.Effect<A, Cause.UnknownError> = Core.toEffect

const stateRowsAt = (stage: string) =>
  onCloudEngine(
    Effect.gen(function*() {
      const store = yield* (yield* State.State)
      return yield* store.list({ stack: CLOUD_STACK_NAME, stage })
    }),
    { providers: Cloudflare.providers(), state: Cloudflare.state() },
  )

const workerStatusAt = (stage: string) =>
  Effect.gen(function*() {
    const token = yield* Config.Redacted('CLOUDFLARE_API_TOKEN')
    const account = yield* Config.String('CLOUDFLARE_ACCOUNT_ID')
    const response = yield* HttpClient.execute(
      HttpClientRequest.get(
        `https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/${probeWorkerName(stage)}/settings`,
      ).pipe(HttpClientRequest.bearerToken(Redacted.value(token))),
    )
    return response.status
  }).pipe(Effect.provide(FetchHttpClient.layer))

const nothingLeftAtStage = Effect.gen(function*() {
  const stage = yield* deployedStage
  const rows = yield* stateRowsAt(stage)
  const status = yield* workerStatusAt(stage)
  return yield* rows.length === 0 && status === 404
    ? Effect.void
    : Effect.die(`stage ${stage} still holds state rows [${rows.join(', ')}] and its worker answers ${status}`)
}).pipe(Effect.orDie)

sharedLayer(Layer.effectDiscard(Effect.addFinalizer(() => nothingLeftAtStage)))

const CloudProbe = alchemyStack(CLOUD_STACK_NAME, { deploy: cloudProbeStack })

const fetchReply = (url: string) =>
  Effect.gen(function*() {
    const client = HttpClient.filterStatusOk(yield* HttpClient.HttpClient)
    const response = yield* client.get(url)
    return yield* response.text
  }).pipe(
    Effect.retry({ times: 12, schedule: Schedule.spaced('2 seconds') }),
    Effect.provide(FetchHttpClient.layer),
  )

Feature('a stack deployed to Cloudflare and destroyed when the Feature ends', { timeout: 120_000 })
  .live('the worker answers over the network from Cloudflare')
  .withLayer(CloudProbe.layer)
  .body(({ scenario }) => {
    scenario(
      'the deployed worker answers over HTTP',
      Gherkin.Do.pipe(
        Given('the stack is deployed to Cloudflare')(
          'stack',
          () => Effect.tap(CloudProbe, (stack) => Effect.sync(() => deployedStages.add(stack.stage))),
        ),
        When('the worker is fetched')('reply', (s) => fetchReply(s.stack.url)),
        Then('it replies with the probe text')((s, expect) => expect(s.reply).toBe(PROBE_REPLY)),
      ),
    )
  })
