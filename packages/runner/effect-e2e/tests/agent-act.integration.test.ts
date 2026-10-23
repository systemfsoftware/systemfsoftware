import { secrets } from '@systemfsoftware/effect-e2e'
import {
  act,
  type ActFailure,
  type ActionEvent,
  type ActOptions,
  type ActRecord,
  type ActResult,
  SecretLedger,
} from '@systemfsoftware/effect-e2e/agent'
import {
  type CacheStorageFailed,
  CacheStore,
  MemoryCacheStore,
  type TraceEntry,
} from '@systemfsoftware/effect-e2e/cache'
import { Engine, type MemorySite, type Observation, type SemanticNode } from '@systemfsoftware/effect-e2e/engine'
import {
  type ModelAnswer,
  type ModelGateway,
  type ModelRequest,
  OpenAiCompatible,
} from '@systemfsoftware/effect-e2e/model'
import { Gherkin, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import * as Effect from 'effect/Effect'
import * as Fiber from 'effect/Fiber'
import * as FetchHttpClient from 'effect/http/FetchHttpClient'
import * as HttpClient from 'effect/http/HttpClient'
import * as Layer from 'effect/Layer'
import * as Logger from 'effect/Logger'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Predicate from 'effect/Predicate'
import * as Redacted from 'effect/Redacted'
import * as Ref from 'effect/Ref'
import * as Result from 'effect/Result'
import { TestClock } from 'effect/testing'
import * as Tracer from 'effect/Tracer'

import {
  babble,
  contextOf,
  done,
  fillSecret,
  GREET_SITE,
  ORIGIN,
  recorder,
  RENAMED_SITE,
  screenshot,
  scriptedGateway,
  SIGN_IN_SITE,
  silentGateway,
  tap,
} from './__fixtures__/agent-sites.fixture.js'
import { openAiStub } from './__fixtures__/openai-stub.fixture.js'

const Feature = makeFeature({ it })

const SECRET_VALUE = 'hunter2-505-6f1d0c'

const API_KEY = 'sk-test-505-9a1e'

type Staged = Option.Option.Value<ActRecord['staged']>

const recordingKindOf = (staged: Staged): string =>
  Match.valueTags(staged.recording, {
    Write: () => 'Write',
    Overwrite: () => 'Overwrite',
    Keep: () => 'Keep',
    Decided: () => 'Decided',
  })

const writtenEntryOf = (staged: Staged): Option.Option<TraceEntry> =>
  Match.valueTags(staged.recording, {
    Write: ({ entry }) => Option.some(entry),
    Overwrite: ({ entry }) => Option.some(entry),
    Keep: () => Option.none(),
    Decided: () => Option.none(),
  })

interface Plan {
  readonly site: MemorySite
  readonly gateway: Layer.Layer<ModelGateway>
  readonly options?: ActOptions
  readonly mode?: 'off' | 'read-only' | 'read-write'
  readonly seed?: Option.Option<Staged>
  readonly secrets?: Readonly<Record<string, Redacted.Redacted<string>>>
}

interface Ran {
  readonly outcome: Result.Result<ActResult, ActFailure>
  readonly events: ReadonlyArray<ActionEvent>
  readonly records: ReadonlyArray<ActRecord>
  readonly screen: Observation
}

const seeded = (seed: Option.Option<Staged>): Effect.Effect<void, CacheStorageFailed, CacheStore> =>
  Effect.flatMap(
    CacheStore,
    (store) =>
      Option.match(
        Option.flatMap(
          seed,
          (staged) => Option.map(writtenEntryOf(staged), (entry) => [staged.digest, entry] as const),
        ),
        {
          onNone: () => Effect.void,
          onSome: ([digest, entry]) => Effect.asVoid(store.write(digest, entry)),
        },
      ),
  )

/** Opens the app, runs one act step, and returns what the step reported plus the screen it left. */
const ran = (plan: Plan) =>
  Effect.gen(function*() {
    const books = yield* recorder
    const events = yield* Ref.make<ReadonlyArray<ActionEvent>>([])
    const onAction = (event: ActionEvent) => Ref.update(events, (all) => [...all, event])
    const program = Effect.gen(function*() {
      const engine = yield* Engine
      yield* engine.open(`${ORIGIN}/`)
      yield* seeded(plan.seed ?? Option.none())
      const outcome = yield* Effect.result(
        act({
          ...plan.options,
          context: contextOf({ record: books.record, mode: plan.mode ?? 'read-write' }),
          instruction: 'press Greet',
          onAction,
        }),
      )
      return { outcome, screen: yield* engine.observe }
    })
    const { outcome, screen } = yield* program.pipe(
      Effect.provide(
        Layer.mergeAll(
          Engine.layerTest(plan.site),
          plan.gateway,
          MemoryCacheStore.layer({ mode: 'read-write' }),
          SecretLedger.layer(plan.secrets ?? {}),
        ),
      ),
      Effect.orDie,
    )
    return { outcome, events: yield* Ref.get(events), records: yield* books.records, screen } satisfies Ran
  })

const namesOn = (screen: Observation): ReadonlyArray<string> => {
  const walk = (nodes: ReadonlyArray<SemanticNode>): ReadonlyArray<string> =>
    nodes.flatMap((node) => [node.name ?? '', ...walk(node.children)])
  return walk(screen.tree)
}

const valueOf = (screen: Observation, id: string): string | undefined =>
  screen.tree.find((node) => node.ref.id === id)?.value

const failureTagOf = (outcome: Result.Result<ActResult, ActFailure>): string =>
  Result.match(outcome, { onFailure: (failure) => failure._tag, onSuccess: () => 'passed' })

const stagedOf = (state: Ran): Option.Option<Staged> =>
  Option.flatMap(Option.fromNullishOr(state.records[0]), (record) => record.staged)

const requestText = (request: ModelRequest | undefined): string => JSON.stringify(request ?? null)

const firstRun = (site: MemorySite, answers: ReadonlyArray<ModelAnswer>) =>
  Effect.flatMap(scriptedGateway(answers), (scripted) => ran({ site, gateway: scripted.layer }))

const withRequests = (plan: Omit<Plan, 'gateway'>, answers: ReadonlyArray<ModelAnswer>) =>
  Effect.gen(function*() {
    const scripted = yield* scriptedGateway(answers)
    const result = yield* ran({ ...plan, gateway: scripted.layer })
    return { ...result, requests: yield* scripted.requests }
  })

const passwordParams: ActOptions = { params: { password: secrets.get('pw') } }

const SECRET_LEDGER = { pw: Redacted.make(SECRET_VALUE) }

// --- the HTTP stub leak run ---------------------------------------------------------------------

const wireReply = (toolCall: { readonly name: string; readonly arguments: object }) => ({
  status: 200,
  body: JSON.stringify({
    id: 'chatcmpl-505',
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

interface Captured {
  readonly spans: Array<Tracer.NativeSpan>
  readonly logs: Array<string>
}

const capturing = (captured: Captured) => <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.withTracer(Tracer.make({
      span(options) {
        const span = new Tracer.NativeSpan(options)
        captured.spans.push(span)
        return span
      },
    })),
    Effect.provideService(HttpClient.TracerHeaderFilter, () => true),
    Effect.provide(Logger.layer([Logger.make((options) => {
      captured.logs.push(JSON.stringify([options.message, String(options.cause)]))
    })])),
  )

const spanTextOf = (span: Tracer.NativeSpan): string =>
  JSON.stringify([span.name, [...span.attributes.entries()], span.events])

const secretOverHttp = Effect.scoped(Effect.gen(function*() {
  const stub = yield* openAiStub
  yield* stub.script([
    wireReply({ name: 'fill', arguments: { ref: 'password', value: { secret: 'pw' } } }),
    wireReply({ name: 'done', arguments: { summary: 'filled the password' } }),
  ])
  const captured: Captured = { spans: [], logs: [] }
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
  const result = yield* capturing(captured)(
    ran({ site: SIGN_IN_SITE, gateway, options: passwordParams, secrets: SECRET_LEDGER }),
  )
  const bodies = (yield* stub.recorded).map((request) => request.body)
  const produced = [
    ...bodies,
    ...captured.logs,
    ...captured.spans.map(spanTextOf),
    ...result.records.map((record) => JSON.stringify(record)),
    ...Option.toArray(Option.flatMap(stagedOf(result), writtenEntryOf)).map((entry) => JSON.stringify(entry)),
  ]
  return {
    passed: failureTagOf(result.outcome),
    filled: valueOf(result.screen, 'password') === SECRET_VALUE,
    requests: bodies.length,
    namedInFirst: (bodies[0] ?? '').includes('secret \\"pw\\", value withheld'),
    leaks: produced.filter((text) => text.includes(SECRET_VALUE)).length,
  }
}))

Feature('Acting toward a goal with replay, budgets and secrets')
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'Pressing Greet performs the action through the model',
      Gherkin.Do.pipe(
        When('the model taps Greet and then reports done')(
          'state',
          () => firstRun(GREET_SITE, [tap('greet'), done('greeted Ada')]),
        ),
        Then('the greeting shows and the step spent model calls on one action')((s, expect) =>
          expect({
            outcome: Result.map(s.state.outcome, (result) => ({
              summary: result.summary,
              modelCalls: result.modelCalls,
              actions: result.actions.length,
              cache: result.cache,
            })),
            greeted: namesOn(s.state.screen).includes('Hello, Ada'),
            sources: s.state.events.map((event) => event.source),
            staged: Option.map(stagedOf(s.state), recordingKindOf),
          }).toEqual({
            outcome: Result.succeed({ summary: 'greeted Ada', modelCalls: 2, actions: 1, cache: { _tag: 'Missed' } }),
            greeted: true,
            sources: ['model'],
            staged: Option.some('Write'),
          })
        ),
      ),
    )

    scenario(
      'A recorded step replays with zero model calls',
      Gherkin.Do.pipe(
        When('the recording of a first run is stored and the step runs again against a model with no answers')(
          'state',
          () =>
            Effect.gen(function*() {
              const first = yield* firstRun(GREET_SITE, [tap('greet'), done('greeted Ada')])
              return yield* withRequests({ site: GREET_SITE, seed: stagedOf(first) }, [])
            }),
        ),
        Then('the greeting shows, no model call is made and every event is a replay')((s, expect) =>
          expect({
            outcome: Result.map(s.state.outcome, (result) => ({ modelCalls: result.modelCalls, cache: result.cache })),
            requests: s.state.requests.length,
            greeted: namesOn(s.state.screen).includes('Hello, Ada'),
            sources: s.state.events.map((event) => event.source),
            staged: Option.map(stagedOf(s.state), recordingKindOf),
          }).toEqual({
            outcome: Result.succeed({ modelCalls: 0, cache: { _tag: 'Replayed' } }),
            requests: 0,
            greeted: true,
            sources: ['replay'],
            staged: Option.some('Keep'),
          })
        ),
      ),
    )

    scenario(
      'A changed control hands off and the model continues from the current screen',
      Gherkin.Do.pipe(
        When('a two-action recording replays against an app whose second control was renamed')(
          'state',
          () =>
            Effect.gen(function*() {
              const first = yield* firstRun(GREET_SITE, [tap('greet'), tap('next'), done('continued')])
              return yield* withRequests({ site: RENAMED_SITE, seed: stagedOf(first) }, [
                tap('next'),
                done('continued'),
              ])
            }),
        ),
        Then('the first action replays, the model sees the renamed control and taps it')((s, expect) =>
          expect({
            outcome: Result.map(s.state.outcome, (result) => ({ modelCalls: result.modelCalls, cache: result.cache })),
            sources: s.state.events.map((event) => event.source),
            seesRenamed: requestText(s.state.requests[0]).includes('\\"Next\\"'),
            toldReplayed: requestText(s.state.requests[0]).includes('Already done'),
            finished: namesOn(s.state.screen).includes('All done'),
            staged: Option.map(stagedOf(s.state), recordingKindOf),
          }).toEqual({
            outcome: Result.succeed({ modelCalls: 2, cache: { _tag: 'HandedOff', reason: 'ControlMissing' } }),
            sources: ['replay', 'model'],
            seesRenamed: true,
            toldReplayed: true,
            finished: true,
            staged: Option.some('Overwrite'),
          })
        ),
      ),
    )

    scenario(
      'One step of budget runs out when the model wants a second action',
      Gherkin.Do.pipe(
        When('maxSteps is 1 and the model taps twice')(
          'state',
          () => withRequests({ site: GREET_SITE, options: { maxSteps: 1 } }, [tap('greet'), tap('next')]),
        ),
        Then('the step fails STEP_BUDGET_EXHAUSTED and stages no recording')((s, expect) =>
          expect({
            failure: failureTagOf(s.state.outcome),
            recorded: s.state.records.map((
              record,
            ) => [Predicate.isTagged(record.outcome, 'Failed'), Option.isSome(record.staged)]),
          }).toEqual({ failure: 'STEP_BUDGET_EXHAUSTED', recorded: [[true, false]] })
        ),
      ),
    )

    scenario(
      'One step of budget is enough when the model then reports done',
      Gherkin.Do.pipe(
        When('maxSteps is 1 and the model taps once then reports done')(
          'state',
          () => withRequests({ site: GREET_SITE, options: { maxSteps: 1 } }, [tap('greet'), done('greeted')]),
        ),
        Then('the step passes')((s, expect) => expect(failureTagOf(s.state.outcome)).toBe('passed')),
      ),
    )

    scenario(
      'Model calls are a budget too',
      Gherkin.Do.pipe(
        When('maxModelCalls is 2 and the model answers in prose twice')(
          'state',
          () => withRequests({ site: GREET_SITE, options: { maxModelCalls: 2 } }, [babble, babble, done('never')]),
        ),
        Then('the step fails STEP_BUDGET_EXHAUSTED after exactly two calls')((s, expect) =>
          expect({ failure: failureTagOf(s.state.outcome), requests: s.state.requests.length }).toEqual({
            failure: 'STEP_BUDGET_EXHAUSTED',
            requests: 2,
          })
        ),
      ),
    )

    scenario(
      'A step that outlives its timeout fails STEP_TIMEOUT',
      Gherkin.Do.pipe(
        When('timeout is 50 ms and the model never answers, and 50 ms pass')(
          'failure',
          () =>
            Effect.gen(function*() {
              const fiber = yield* Effect.forkChild(
                ran({ site: GREET_SITE, gateway: silentGateway, options: { timeout: 50 } }),
              )
              yield* TestClock.adjust('50 millis')
              const result = yield* Fiber.join(fiber)
              return [
                failureTagOf(result.outcome),
                result.records.map((record) => Predicate.isTagged(record.outcome, 'Failed')),
              ] as const
            }),
        ),
        Then('the step fails STEP_TIMEOUT and is recorded as failed')((s, expect) =>
          expect(s.failure).toEqual(['STEP_TIMEOUT', [true]])
        ),
      ),
    )

    scenario(
      'An invalid tool call goes back to the model as a tool error',
      Gherkin.Do.pipe(
        When('the model first taps a ref that is not on screen, then taps Greet')(
          'state',
          () => withRequests({ site: GREET_SITE }, [tap('nowhere'), tap('greet'), done('greeted')]),
        ),
        Then('the second request carries the error for the unknown ref and the step passes')((s, expect) =>
          expect({
            failure: failureTagOf(s.state.outcome),
            told: (s.state.requests[1]?.messages ?? []).some((message) =>
              Predicate.isTagged(message, 'ToolMessage') && message.content.includes('nowhere')
            ),
          }).toEqual({ failure: 'passed', told: true })
        ),
      ),
    )

    scenario(
      'An action the app refuses costs a step and is reported to the model',
      Gherkin.Do.pipe(
        When('maxSteps is 1 and the model taps a disabled button, then another')(
          'state',
          () => withRequests({ site: SIGN_IN_SITE, options: { maxSteps: 1 } }, [tap('locked'), tap('sign-in')]),
        ),
        Then('the refusal reaches the model and the step budget is spent')((s, expect) =>
          expect({
            failure: failureTagOf(s.state.outcome),
            told: (s.state.requests[1]?.messages ?? []).some((message) =>
              Predicate.isTagged(message, 'ToolMessage') && message.content.startsWith('could not')
            ),
          }).toEqual({ failure: 'STEP_BUDGET_EXHAUSTED', told: true })
        ),
      ),
    )

    scenario(
      'With the cache off the step neither reads nor stages a recording',
      Gherkin.Do.pipe(
        When('the cache mode is off')(
          'state',
          () => withRequests({ site: GREET_SITE, mode: 'off' }, [tap('greet'), done('greeted')]),
        ),
        Then('the cache decision is Off and nothing is staged')((s, expect) =>
          expect({
            cache: Result.map(s.state.outcome, (result) => result.cache),
            staged: Option.isSome(stagedOf(s.state)),
          }).toEqual({ cache: Result.succeed({ _tag: 'Off' }), staged: false })
        ),
      ),
    )

    scenario(
      'A secret the ledger does not hold fails before any model call',
      Gherkin.Do.pipe(
        When('the params name secret pw and the ledger holds none')(
          'state',
          () => withRequests({ site: SIGN_IN_SITE, options: passwordParams }, [done('never')]),
        ),
        Then('the step fails SECRET_UNAVAILABLE without asking the model')((s, expect) =>
          expect({ failure: failureTagOf(s.state.outcome), requests: s.state.requests.length }).toEqual({
            failure: 'SECRET_UNAVAILABLE',
            requests: 0,
          })
        ),
      ),
    )

    scenario(
      'A screenshot after a secret fill is refused',
      Gherkin.Do.pipe(
        When('the model fills the password secret and then asks for a screenshot')(
          'state',
          () =>
            withRequests(
              { site: SIGN_IN_SITE, options: passwordParams, secrets: SECRET_LEDGER },
              [fillSecret({ ref: 'password', secret: 'pw' }), screenshot],
            ),
        ),
        Then('the step fails POLICY_DENIED')((s, expect) =>
          expect(failureTagOf(s.state.outcome)).toBe('POLICY_DENIED')
        ),
      ),
    )

    scenario(
      'A screenshot before any secret fill reaches the model as an image',
      Gherkin.Do.pipe(
        When('the model asks for a screenshot first')(
          'state',
          () => withRequests({ site: GREET_SITE }, [screenshot, done('looked')]),
        ),
        Then('the second request carries an image part and the step passes')((s, expect) =>
          expect({
            failure: failureTagOf(s.state.outcome),
            image: (s.state.requests[1]?.messages ?? []).some((message) =>
              Predicate.isTagged(message, 'UserMessage') && message.content.some(Predicate.isTagged('ImagePart'))
            ),
          }).toEqual({ failure: 'passed', image: true })
        ),
      ),
    )

    scenario(
      'A secret reaches the model by name only, over the real OpenAI-compatible adapter',
      { live: 'the model requests go to a real node:http stub over a loopback socket' },
      Gherkin.Do.pipe(
        When('the model fills the password secret and reports done through the HTTP stub')('run', () => secretOverHttp),
        Then('the box holds the value, the request names pw, and no request, log, span, record or recording holds it')((
          s,
          expect,
        ) => expect(s.run).toEqual({ passed: 'passed', filled: true, requests: 2, namedInFirst: true, leaks: 0 })),
      ),
    )
  })
