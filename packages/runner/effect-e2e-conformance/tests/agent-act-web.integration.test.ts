import { web } from '@systemfsoftware/effect-e2e'
import { layer } from '@systemfsoftware/effect-e2e-web'
import {
  act,
  type ActContext,
  type ActionEvent,
  type ActRecord,
  type ActResult,
  SecretLedger,
} from '@systemfsoftware/effect-e2e/agent'
import { CacheStore, MemoryCacheStore, TraceEntry } from '@systemfsoftware/effect-e2e/cache'
import { Engine, type Observation, type SemanticNode } from '@systemfsoftware/effect-e2e/engine'
import { type ModelAnswer, ModelGateway, type ModelRequest } from '@systemfsoftware/effect-e2e/model'
import { Gherkin, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Duration, Effect, Layer, Match, Option, Predicate, Ref, Result } from 'effect'

import { type GreetApp, servedGreetApp } from './__fixtures__/greet-app-server.js'

const Feature = makeFeature({ it })

type Reply = (request: ModelRequest) => ModelAnswer

const textsOf = (message: ModelRequest['messages'][number]): ReadonlyArray<string> =>
  Match.valueTags(message, {
    UserMessage: (user) => user.content.flatMap((part) => Predicate.isTagged(part, 'TextPart') ? [part.text] : []),
    AssistantMessage: () => [],
    ToolMessage: () => [],
  })

const screenTextOf = (request: ModelRequest | undefined): string =>
  (request?.messages ?? []).flatMap(textsOf).at(-1) ?? ''

/** Reads the button's ref off the screen text in the request, the way a model reads its prompt. */
const tapButton = (name: string): Reply => (request) => {
  const ref = new RegExp(`\\[([^\\]]+)\\] button "${name}"`, 'u').exec(screenTextOf(request))?.[1] ?? 'missing'
  return { _tag: 'ToolCalls', calls: [{ id: `call-${name}`, name: 'tap', arguments: { ref } }] }
}

const done = (summary: string): Reply => () => ({
  _tag: 'ToolCalls',
  calls: [{ id: 'call-done', name: 'done', arguments: { summary } }],
})

const scriptedGateway = (replies: ReadonlyArray<Reply>) =>
  Effect.gen(function*() {
    const queue = yield* Ref.make(replies)
    const seen = yield* Ref.make<ReadonlyArray<ModelRequest>>([])
    const complete = (request: ModelRequest) =>
      Effect.gen(function*() {
        yield* Ref.update(seen, (all) => [...all, request])
        const reply = yield* Ref.modify(queue, (left) => [left[0], left.slice(1)] as const)
        return yield* reply === undefined
          ? Effect.die('the scripted model has no answer left')
          : Effect.succeed({
            answer: reply(request),
            finishReason: 'tool_calls' as const,
            usage: { input: 100, output: 10 },
            served: { provider: 'scripted', model: 'scripted-act-model' },
            latency: Duration.millis(1),
          })
      })
    return { layer: Layer.succeed(ModelGateway, ModelGateway.of({ complete })), requests: Ref.get(seen) }
  })

const keyFields = TraceEntry.fields.keyedBy.fields

const contextOf = (app: GreetApp, record: ActContext['record']): ActContext => ({
  stepIndex: 0,
  agent: {
    name: 'default',
    config: {
      model: {
        gateway: 'openrouter',
        model: 'deepseek/deepseek-flash-latest',
        apiKeyEnv: 'OPENROUTER_API_KEY',
        vision: false,
      },
      system: '',
      context: '',
      maxSteps: 10,
      maxModelCalls: 10,
    },
  },
  cache: {
    mode: 'read-write',
    project: keyFields.project.make('agent-act-web'),
    test: keyFields.test.make('agent-act-web > greets'),
    target: keyFields.target.make('local'),
    engine: { adapter: 'playwright', kind: 'web' },
    engineVersion: 'chromium',
    app: app.origin,
    version: '0.0.0-conformance',
  },
  timeout: '45 seconds',
  record,
})

interface Ran {
  readonly result: Result.Result<
    { readonly modelCalls: number; readonly actions: number; readonly cache: ActResult['cache'] },
    string
  >
  readonly events: ReadonlyArray<ActionEvent['source']>
  readonly requests: ReadonlyArray<ModelRequest>
  readonly staged: ActRecord['staged']
  readonly screen: ReadonlyArray<string>
}

const namesOf = (screen: Observation): ReadonlyArray<string> => {
  const walk = (nodes: ReadonlyArray<SemanticNode>): ReadonlyArray<string> =>
    nodes.flatMap((node) => [node.name ?? '', ...walk(node.children)])
  return walk(screen.tree)
}

type Staged = Option.Option.Value<ActRecord['staged']>

const writtenEntryOf = (staged: Staged): Option.Option<TraceEntry> =>
  Match.valueTags(staged.recording, {
    Write: ({ entry }) => Option.some(entry),
    Overwrite: ({ entry }) => Option.some(entry),
    Keep: () => Option.none(),
    Decided: () => Option.none(),
  })

const seeded = (seed: ActRecord['staged']) =>
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

const ran = (app: GreetApp, replies: ReadonlyArray<Reply>, seed: ActRecord['staged']) =>
  Effect.gen(function*() {
    const scripted = yield* scriptedGateway(replies)
    const records = yield* Ref.make<ReadonlyArray<ActRecord>>([])
    const events = yield* Ref.make<ReadonlyArray<ActionEvent['source']>>([])
    const program = Effect.gen(function*() {
      const engine = yield* Engine
      yield* engine.open(`${app.origin}/`)
      yield* seeded(seed)
      const outcome = yield* Effect.result(
        act({
          context: contextOf(app, (record) => Ref.update(records, (all) => [...all, record])),
          instruction: 'press Greet',
          onAction: (event) => Ref.update(events, (all) => [...all, event.source]),
        }),
      )
      return { outcome, screen: yield* engine.observe }
    })
    const { outcome, screen } = yield* program.pipe(
      Effect.provide(Layer.mergeAll(
        Layer.orDie(layer({ spec: web({ browser: 'chromium' }), contextHeaders: {} })),
        scripted.layer,
        MemoryCacheStore.layer({ mode: 'read-write' }),
        SecretLedger.layer({}),
      )),
      Effect.orDie,
    )
    const recorded = yield* Ref.get(records)
    return {
      result: Result.match(outcome, {
        onFailure: (failure) => Result.fail(failure._tag),
        onSuccess: (done) =>
          Result.succeed({ modelCalls: done.modelCalls, actions: done.actions.length, cache: done.cache }),
      }),
      events: yield* Ref.get(events),
      requests: yield* scripted.requests,
      staged: Option.flatMap(Option.fromNullishOr(recorded[0]), (record) => record.staged),
      screen: namesOf(screen),
    } satisfies Ran
  })

const greetsThenReplays = Effect.scoped(Effect.gen(function*() {
  const app = yield* servedGreetApp
  const first = yield* ran(app, [tapButton('Greet'), done('greeted Ada')], Option.none())
  const second = yield* ran(app, [], first.staged)
  return { first, second }
}))

const handsOffAfterRename = Effect.scoped(Effect.gen(function*() {
  const app = yield* servedGreetApp
  const first = yield* ran(app, [tapButton('Greet'), tapButton('Continue'), done('continued')], Option.none())
  yield* app.renameSecond('Next')
  return yield* ran(app, [tapButton('Next'), done('continued')], first.staged)
}))

Feature('Acting toward a goal in Chromium')
  .live('Chromium drives the greeting app served as static HTML on a loopback socket')
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'Pressing Greet acts through the model, and the recording replays with zero model calls',
      Gherkin.Do.pipe(
        When('the model presses Greet, and then the step runs again from its recording')(
          'runs',
          () => greetsThenReplays,
        ),
        Then('the first run spends model calls on one action and the replay spends none')((s, expect) =>
          expect({
            first: [s.runs.first.result, s.runs.first.events, s.runs.first.screen.includes('Hello, Ada')],
            second: [
              s.runs.second.result,
              s.runs.second.events,
              s.runs.second.requests.length,
              s.runs.second.screen.includes('Hello, Ada'),
            ],
          }).toEqual({
            first: [Result.succeed({ modelCalls: 2, actions: 1, cache: { _tag: 'Missed' } }), ['model'], true],
            second: [Result.succeed({ modelCalls: 0, actions: 1, cache: { _tag: 'Replayed' } }), ['replay'], 0, true],
          })
        ),
      ),
    )

    scenario(
      'A renamed control hands off and the model continues from the current page',
      Gherkin.Do.pipe(
        When('a two-action recording replays after the second button was renamed Next')(
          'run',
          () => handsOffAfterRename,
        ),
        Then('the first action replays and the model presses the renamed button it sees')((s, expect) =>
          expect({
            result: s.run.result,
            events: s.run.events,
            seesRenamed: screenTextOf(s.run.requests[0]).includes('button "Next"'),
            finished: s.run.screen.includes('All done'),
          }).toEqual({
            result: Result.succeed({
              modelCalls: 2,
              actions: 2,
              cache: { _tag: 'HandedOff', reason: 'ControlMissing' },
            }),
            events: ['replay', 'model'],
            seesRenamed: true,
            finished: true,
          })
        ),
      ),
    )
  })
