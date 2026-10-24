import { secrets } from '@systemfsoftware/effect-e2e'
import { act, type ActOptions, type ActRecord, extract, SecretLedger } from '@systemfsoftware/effect-e2e/agent'
import { CacheStore, MemoryCacheStore } from '@systemfsoftware/effect-e2e/cache'
import { Engine, type MemorySite } from '@systemfsoftware/effect-e2e/engine'
import { type ModelAnswer, type ModelGateway, OpenAiCompatible } from '@systemfsoftware/effect-e2e/model'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import * as Effect from 'effect/Effect'
import * as FetchHttpClient from 'effect/http/FetchHttpClient'
import * as HttpClient from 'effect/http/HttpClient'
import * as Layer from 'effect/Layer'
import * as Match from 'effect/Match'
import type * as Metric from 'effect/Metric'
import * as Option from 'effect/Option'
import * as Redacted from 'effect/Redacted'
import * as Schema from 'effect/Schema'

import {
  babble,
  contextOf,
  done,
  GREET_SITE,
  ORIGIN,
  recorder,
  scriptedGateway,
  SIGN_IN_SITE,
  tap,
} from './__fixtures__/agent-sites.fixture.js'
import { resolveCheck, VISION_GREET_SITE, withRequests } from './__fixtures__/judgment-sites.fixture.js'
import { openAiStub } from './__fixtures__/openai-stub.fixture.js'
import type { ReceivedSpan, ReceivedValue } from './__fixtures__/otlp-body.schema.js'
import { collected } from './__fixtures__/otlp-collector.fixture.js'

const Feature = makeFeature({ it })

const SECRET_VALUE = 'hunter2-509-7c2e41'

const API_KEY = 'sk-test-509-b83f0a'

const WHERE = { 'e2e.test.id': 'tests/agent.e2e.ts > greets', 'e2e.target': 'local', 'e2e.step.index': 0 }

const JUDGED_WHERE = { ...WHERE, 'e2e.test.id': 'tests/agent-judgment.e2e.ts > judges' }

const attributesNamed = (
  spans: ReadonlyArray<ReceivedSpan>,
  name: string,
): ReadonlyArray<Record<string, ReceivedValue>> =>
  spans.filter((span) => span.name === name).map((span) => span.attributes)

const worldOf = (
  site: MemorySite,
  gateway: Layer.Layer<ModelGateway>,
  ledger: Parameters<typeof SecretLedger.layer>[0],
) =>
  Layer.mergeAll(
    Engine.layerTest(site),
    gateway,
    MemoryCacheStore.layer({ mode: 'read-write' }),
    SecretLedger.layer(ledger),
  )

const storedFrom = (records: ReadonlyArray<ActRecord>) =>
  Effect.flatMap(
    CacheStore,
    (store) =>
      Effect.forEach(records.flatMap((record) => Option.toArray(record.staged)), (staged) =>
        Match.valueTags(staged.recording, {
          Write: ({ entry }) =>
            Effect.asVoid(store.write(staged.digest, entry)),
          Overwrite: ({ entry }) => Effect.asVoid(store.write(staged.digest, entry)),
          Keep: () => Effect.void,
          Decided: () => Effect.void,
        }), { discard: true }),
  )

const greetedTwice = Effect.gen(function*() {
  const books = yield* recorder
  const scripted = yield* scriptedGateway([tap('greet'), done('greeted Ada')])
  const context = contextOf({ record: books.record, mode: 'read-write' })
  const greeted = Effect.gen(function*() {
    yield* (yield* Engine).open(`${ORIGIN}/`)
    yield* act({ context, instruction: 'press Greet' })
  })
  yield* Effect.gen(function*() {
    yield* greeted
    yield* storedFrom(yield* books.records)
    yield* greeted
  }).pipe(Effect.provide(worldOf(GREET_SITE, scripted.layer, {})), Effect.orDie)
})

const countSchemaOf = () =>
  Schema.Struct({ count: Schema.Finite }).pipe(Schema.toStandardSchemaV1, Schema.toStandardJSONSchemaV1)

const extracted: ModelAnswer = {
  _tag: 'ToolCalls',
  calls: [{ id: 'call-extracted', name: 'extracted', arguments: { value: { count: 2 } } }],
}

const greetingResolved = resolveCheck({
  combine: 'all',
  literals: [{ predicate: 'text', target: { ref: 'hello' }, match: 'contains', value: 'Hello' }],
})

const judgedAndRead = Effect.gen(function*() {
  yield* withRequests({
    plan: {
      engine: Engine.layerTest(VISION_GREET_SITE),
      path: '/greeted',
      kind: 'assert',
      sentence: 'the greeting says hello',
      vision: true,
      visionContext: true,
    },
    answers: [greetingResolved],
  })
  yield* withRequests({
    plan: { engine: Engine.layerTest(GREET_SITE), path: '/greeted', kind: 'waitFor', sentence: 'the greeting shows' },
    answers: [greetingResolved],
  })
  const scripted = yield* scriptedGateway([extracted])
  yield* Effect.gen(function*() {
    yield* (yield* Engine).open(`${ORIGIN}/greeted`)
    yield* extract({
      context: { ...contextOf({ record: () => Effect.void, mode: 'read-write' }), record: () => Effect.void },
      instruction: 'read the count',
      schema: countSchemaOf(),
    })
  }).pipe(Effect.provide(worldOf(GREET_SITE, scripted.layer, {})), Effect.orDie)
})

const exhaustedAct = Effect.gen(function*() {
  const books = yield* recorder
  const scripted = yield* scriptedGateway([babble, babble])
  return yield* Effect.gen(function*() {
    yield* (yield* Engine).open(`${ORIGIN}/`)
    return yield* Effect.exit(act({
      context: contextOf({ record: books.record, mode: 'off' }),
      instruction: 'press Greet',
      maxModelCalls: 1,
    }))
  }).pipe(Effect.provide(worldOf(GREET_SITE, scripted.layer, {})))
})

const passwordParams: ActOptions = { params: { password: secrets.get('pw') } }

const wireReply = (toolCall: { readonly name: string; readonly arguments: object }) => ({
  status: 200,
  body: JSON.stringify({
    id: 'chatcmpl-509',
    object: 'chat.completion',
    model: 'act-model',
    choices: [{
      index: 0,
      message: {
        role: 'assistant',
        content: null,
        tool_calls: [{
          id: `call_${toolCall.name}`,
          type: 'function',
          function: { name: toolCall.name, arguments: JSON.stringify(toolCall.arguments) },
        }],
      },
      finish_reason: 'tool_calls',
    }],
    usage: { prompt_tokens: 50, completion_tokens: 5, total_tokens: 55 },
  }),
})

const secretFilledOverHttp = Effect.scoped(Effect.gen(function*() {
  const stub = yield* openAiStub
  yield* stub.script([
    wireReply({ name: 'fill', arguments: { ref: 'password', value: { secret: 'pw' } } }),
    wireReply({ name: 'done', arguments: { summary: 'filled the password' } }),
  ])
  const gateway = OpenAiCompatible.layer({
    model: {
      gateway: 'openai-compatible',
      baseURL: stub.origin,
      model: 'act-model',
      apiKeyEnv: 'ACT_API_KEY',
      vision: false,
    },
    apiKey: Option.some(Redacted.make(API_KEY)),
  }).pipe(Layer.provide(FetchHttpClient.layer))
  const books = yield* recorder
  yield* Effect.gen(function*() {
    yield* (yield* Engine).open(`${ORIGIN}/`)
    yield* act({
      ...passwordParams,
      context: contextOf({ record: books.record, mode: 'read-write' }),
      instruction: 'fill the password',
    })
  }).pipe(
    Effect.provide(worldOf(SIGN_IN_SITE, gateway, { pw: Redacted.make(SECRET_VALUE) })),
    Effect.provideService(HttpClient.TracerHeaderFilter, () => true),
    Effect.orDie,
  )
}))

Feature('Tracing every step a run takes to the collector')
  .withLayer(Layer.empty)
  .live('every scenario exports to a real loopback OTLP receiver over a real HTTP client')
  .body(({ scenario }) => {
    scenario(
      'An act that misses and then replays shows both, with the model calls and the engine actions under them',
      Gherkin.Do.pipe(
        Given('a run exporting to the collector')('registry', () => Effect.succeed<Metric.MetricRegistry>(new Map())),
        When('the model taps Greet and reports done, and the stored recording then replays the step')(
          'exported',
          ({ registry }) => collected(registry)(greetedTwice),
        ),
        Then('the collector holds both act spans, the replay, both engine actions and both model calls')((s, expect) =>
          expect({
            act: attributesNamed(s.exported.spans, 'e2e.act'),
            replay: attributesNamed(s.exported.spans, 'e2e.replay'),
            engineActions: attributesNamed(s.exported.spans, 'e2e.engine.action'),
            modelCalls: attributesNamed(s.exported.spans, 'e2e.model.call'),
          }).toEqual({
            act: [
              {
                ...WHERE,
                'e2e.cache.outcome': 'missed',
                'e2e.model.calls': 2,
                'e2e.tokens.input': 200,
                'e2e.tokens.output': 20,
              },
              {
                ...WHERE,
                'e2e.cache.outcome': 'replayed',
                'e2e.model.calls': 0,
                'e2e.tokens.input': 0,
                'e2e.tokens.output': 0,
              },
            ],
            replay: [{
              'e2e.replay.recorded_actions': 1,
              'e2e.cache.outcome': 'replayed',
              'e2e.replay.stop_reason': 'none',
            }],
            engineActions: [
              { 'e2e.action.kind': 'Tap', 'e2e.locator.label': 'button "Greet"' },
              { 'e2e.action.kind': 'Tap', 'e2e.locator.label': 'button "Greet"' },
            ],
            modelCalls: [0, 1].map(() => ({
              'gen_ai.operation.name': 'chat',
              'gen_ai.request.model': 'deepseek/deepseek-flash-latest',
              'gen_ai.provider.name': 'scripted',
              'gen_ai.response.model': 'scripted-act-model',
              'gen_ai.usage.input_tokens': 100,
              'gen_ai.usage.output_tokens': 10,
              'gen_ai.response.finish_reasons': ['tool_calls'],
            })),
          })
        ),
      ),
    )

    scenario(
      'Each judgment and each read carries what it checked and how it looked',
      Gherkin.Do.pipe(
        Given('a run exporting to the collector')('registry', () => Effect.succeed<Metric.MetricRegistry>(new Map())),
        When('a statement is asserted with vision, a condition is waited for, and a count is read')(
          'exported',
          ({ registry }) => collected(registry)(judgedAndRead),
        ),
        Then('the collector holds one span for each, with its check kind and vision mode')((s, expect) =>
          expect({
            assert: attributesNamed(s.exported.spans, 'e2e.assert'),
            waitFor: attributesNamed(s.exported.spans, 'e2e.waitFor'),
            extract: attributesNamed(s.exported.spans, 'e2e.extract'),
          }).toEqual({
            assert: [{
              ...JUDGED_WHERE,
              'e2e.vision.mode': 'true',
              'e2e.check.kind': 'Text',
              'e2e.cache.outcome': 'missed',
              'e2e.model.calls': 1,
            }],
            waitFor: [{
              ...JUDGED_WHERE,
              'e2e.vision.mode': 'false',
              'e2e.check.kind': 'Text',
              'e2e.cache.outcome': 'missed',
              'e2e.model.calls': 1,
            }],
            extract: [{ ...WHERE, 'e2e.vision.mode': 'false', 'e2e.model.calls': 1 }],
          })
        ),
      ),
    )

    scenario(
      'A step that fails under export fails exactly as it does with nothing exported',
      Gherkin.Do.pipe(
        Given('a run exporting to the collector')('registry', () => Effect.succeed<Metric.MetricRegistry>(new Map())),
        When('an act runs out of model calls, once exported and once not')('exits', ({ registry }) =>
          Effect.all({
            exported: Effect.map(collected(registry)(exhaustedAct), (run) => run.value),
            silent: exhaustedAct,
          })),
        Then('both runs end with the same exit')((s, expect) => expect(s.exits.exported).toStrictEqual(s.exits.silent)),
      ),
    )

    scenario(
      'Nothing exported carries a secret value or the API key',
      Gherkin.Do.pipe(
        Given('a run exporting to the collector')('registry', () => Effect.succeed<Metric.MetricRegistry>(new Map())),
        When('the model fills a password secret over a real HTTP gateway keyed with an API key')(
          'exported',
          ({ registry }) => collected(registry)(secretFilledOverHttp),
        ),
        Then('the step was traced, and no exported body names the secret or the key')((s, expect) =>
          expect({
            acts: attributesNamed(s.exported.spans, 'e2e.act').length,
            modelCalls: attributesNamed(s.exported.spans, 'e2e.model.call').length,
            fills: attributesNamed(s.exported.spans, 'e2e.engine.action').map((each) => each['e2e.action.kind']),
            secretLeaks: s.exported.bodies.filter((body) => body.includes(SECRET_VALUE)).length,
            keyLeaks: s.exported.bodies.filter((body) => body.includes(API_KEY)).length,
          }).toEqual({ acts: 1, modelCalls: 2, fills: ['Fill'], secretLeaks: 0, keyLeaks: 0 })
        ),
      ),
    )
  })
