import { secrets } from '@systemfsoftware/effect-e2e'
import { act, assert, SecretLedger } from '@systemfsoftware/effect-e2e/agent'
import { MemoryCacheStore } from '@systemfsoftware/effect-e2e/cache'
import { Engine } from '@systemfsoftware/effect-e2e/engine'
import { OpenAiCompatible } from '@systemfsoftware/effect-e2e/model'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import * as Effect from 'effect/Effect'
import * as FetchHttpClient from 'effect/http/FetchHttpClient'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Redacted from 'effect/Redacted'

import { contextOf, done, fillSecret, GREET_SITE, ORIGIN, recorder } from './__fixtures__/agent-sites.fixture.js'
import {
  failureTagOf,
  hasImageOf,
  judgmentRecorder,
  type Plan,
  ran,
  requestText,
  resolveCheck,
  scriptedGateway,
  stagedOf,
  VISION_GREET_SITE,
  VISION_SIGN_IN_SITE,
  visionJudgmentContext,
  withRequests,
} from './__fixtures__/judgment-sites.fixture.js'
import { openAiStub } from './__fixtures__/openai-stub.fixture.js'

const Feature = makeFeature({ it })

const FILLED_SECRET_LEDGER = { pw: Redacted.make('hunter2-505-6f1d0c') }

Feature('Judging by vision')
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'Vision-only sends the screenshot and no element tree over the wire',
      { live: 'the judgment request goes to a real node:http stub over a loopback socket' },
      Gherkin.Do.pipe(
        Given('the stub scripts one resolve_check answer for a vision-only request')('reply', () =>
          Effect.succeed(
            wireReply({
              name: 'resolve_check',
              arguments: {
                combine: 'all',
                literals: [{
                  predicate: 'text',
                  target: { role: 'heading', name: 'Hello, Ada' },
                  match: 'contains',
                  value: 'Hello',
                }],
              },
            }),
          )),
        When('the statement is asserted with vision only through the OpenAI-compatible adapter')(
          'run',
          (s) => visionOverHttp(s.reply),
        ),
        Then('the wire body carries an image part and no tree line')((s, expect) =>
          expect(s.run).toEqual({ passed: 'passed', imagePart: true, treeRef: false })
        ),
      ),
    )

    scenario(
      'Vision adds the screenshot to the tree',
      Gherkin.Do.pipe(
        Given('a vision-capable model and engine judge the greeted screen')('plan', () =>
          Effect.succeed(
            {
              engine: Engine.layerTest(VISION_GREET_SITE),
              path: '/greeted',
              kind: 'assert',
              sentence: 'the greeting says hello',
              vision: true,
              visionContext: true,
            } satisfies Omit<Plan, 'gateway'>,
          )),
        When('the statement is asserted with vision')('state', (s) =>
          withRequests({
            plan: s.plan,
            answers: [
              resolveCheck({
                combine: 'all',
                literals: [{ predicate: 'text', target: { ref: 'hello' }, match: 'contains', value: 'Hello' }],
              }),
            ],
          })),
        Then('the request carries the tree and an image part, and the step passes')((s, expect) =>
          expect({
            outcome: failureTagOf(s.state.outcome),
            requests: s.state.requests.length,
            tree: s.state.requests[0] !== undefined && requestText(s.state.requests[0]).includes('[hello]'),
            image: s.state.requests[0] !== undefined && hasImageOf(s.state.requests[0]),
          }).toEqual({
            outcome: 'passed',
            requests: 1,
            tree: true,
            image: true,
          })
        ),
      ),
    )

    scenario(
      'A text-only model refuses vision before any call, even with a recording',
      Gherkin.Do.pipe(
        Given('a passing run staged a recording on the vision-capable app')('first', () =>
          Effect.gen(function*() {
            const scripted = yield* scriptedGateway([
              resolveCheck({
                combine: 'all',
                literals: [{ predicate: 'text', target: { ref: 'hello' }, match: 'contains', value: 'Hello' }],
              }),
            ])
            const result = yield* ran({
              engine: Engine.layerTest(VISION_GREET_SITE),
              path: '/greeted',
              kind: 'assert',
              sentence: 'the greeting says hello',
              gateway: scripted.layer,
              visionContext: true,
            })
            return { staged: stagedOf(result) }
          })),
        When('the same statement is asserted with vision only on a text-only model')(
          'state',
          (s) =>
            Effect.gen(function*() {
              const scripted = yield* scriptedGateway([])
              const result = yield* ran({
                engine: Engine.layerTest(VISION_GREET_SITE),
                path: '/greeted',
                kind: 'assert',
                sentence: 'the greeting says hello',
                vision: 'only',
                gateway: scripted.layer,
                seed: s.first.staged,
              })
              return { ...result, requests: yield* scripted.requests }
            }),
        ),
        Then('the step fails UNSUPPORTED_CAPABILITY with zero requests')((s, expect) =>
          expect({
            failure: failureTagOf(s.state.outcome),
            requests: s.state.requests.length,
          }).toEqual({
            failure: 'UNSUPPORTED_CAPABILITY',
            requests: 0,
          })
        ),
      ),
    )

    scenario(
      'An engine without vision refuses the judgment',
      Gherkin.Do.pipe(
        Given('a vision-capable model judges a screen on an engine without vision')('plan', () =>
          Effect.succeed(
            {
              engine: Engine.layerTest(GREET_SITE),
              path: '/greeted',
              kind: 'assert',
              sentence: 'the greeting says hello',
              vision: 'only',
              visionContext: true,
            } satisfies Omit<Plan, 'gateway'>,
          )),
        When('the statement is asserted with vision only')('state', (s) => withRequests({ plan: s.plan, answers: [] })),
        Then('the step fails UNSUPPORTED_CAPABILITY with zero requests')((s, expect) =>
          expect({
            failure: failureTagOf(s.state.outcome),
            requests: s.state.requests.length,
          }).toEqual({
            failure: 'UNSUPPORTED_CAPABILITY',
            requests: 0,
          })
        ),
      ),
    )

    scenario(
      'A vision judgment after a secret fill is refused',
      Gherkin.Do.pipe(
        Given('the model filled the password secret and reported done')('run', () =>
          Effect.gen(function*() {
            const actBooks = yield* recorder
            const judgeBooks = yield* judgmentRecorder
            const scripted = yield* scriptedGateway([
              fillSecret({ ref: 'password', secret: 'pw' }),
              done('filled the password'),
            ])
            const program = Effect.gen(function*() {
              const engine = yield* Engine
              yield* engine.open(`${ORIGIN}/`)
              const actOutcome = yield* Effect.result(
                act({
                  context: contextOf({ record: actBooks.record, mode: 'read-write' }),
                  instruction: 'enter the password',
                  params: { password: secrets.get('pw') },
                }),
              )
              const judgeOutcome = yield* Effect.result(
                assert({
                  context: visionJudgmentContext({ record: judgeBooks.record, mode: 'read-write' }),
                  statement: 'the password box is empty',
                  vision: true,
                }),
              )
              return { act: actOutcome, judge: judgeOutcome }
            })
            const outcomes = yield* program.pipe(
              Effect.provide(
                Layer.mergeAll(
                  Engine.layerTest(VISION_SIGN_IN_SITE),
                  scripted.layer,
                  MemoryCacheStore.layer({ mode: 'read-write' }),
                  SecretLedger.layer(FILLED_SECRET_LEDGER),
                ),
              ),
              Effect.orDie,
            )
            return { ...outcomes, requests: yield* scripted.requests }
          })),
        Then('the act passes and the judgment fails POLICY_DENIED without a request of its own')((s, expect) =>
          expect({
            act: failureTagOf(s.run.act),
            judge: failureTagOf(s.run.judge),
            requests: s.run.requests.length,
          }).toEqual({
            act: 'passed',
            judge: 'POLICY_DENIED',
            requests: 2,
          })
        ),
      ),
    )
  })

const wireReply = (toolCall: { readonly name: string; readonly arguments: object }) => ({
  status: 200,
  body: JSON.stringify({
    id: 'chatcmpl-506',
    object: 'chat.completion',
    model: 'judge-model',
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

const visionOverHttp = (reply: { readonly status: number; readonly body: string }) =>
  Effect.scoped(Effect.gen(function*() {
    const stub = yield* openAiStub
    yield* stub.script([reply])
    const gateway = OpenAiCompatible.layer({
      model: {
        gateway: 'openai-compatible',
        baseURL: stub.origin,
        model: 'judge-model',
        apiKeyEnv: 'JUDGE_API_KEY',
        vision: true,
      },
      apiKey: Option.some(Redacted.make('sk-test-506')),
    }).pipe(Layer.provide(FetchHttpClient.layer))
    const books = yield* judgmentRecorder
    const program = Effect.gen(function*() {
      const engine = yield* Engine
      yield* engine.open(`${ORIGIN}/greeted`)
      const context = visionJudgmentContext({ record: books.record, mode: 'read-write' })
      return yield* Effect.result(assert({ context, statement: 'the greeting says hello', vision: 'only' }))
    })
    const outcome = yield* program.pipe(
      Effect.provide(
        Layer.mergeAll(
          Engine.layerTest(VISION_GREET_SITE),
          gateway,
          MemoryCacheStore.layer({ mode: 'read-write' }),
          SecretLedger.layer({}),
        ),
      ),
      Effect.orDie,
    )
    const body = (yield* stub.recorded)[0]?.body ?? ''
    return {
      passed: failureTagOf(outcome),
      imagePart: body.includes('image_url'),
      treeRef: body.includes('[hello]'),
    }
  }))
