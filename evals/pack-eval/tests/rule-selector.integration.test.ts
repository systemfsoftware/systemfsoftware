import { OpenRouterClient, OpenRouterLanguageModel } from '@effect/ai-openrouter'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { PackEval } from '@systemfsoftware/pack-eval'
import { Effect, Layer, Redacted, Schema } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import * as Path from 'effect/Path'
import { expect } from 'vitest'
import {
  type LoopbackReply,
  OpenRouterLoopback,
  openRouterLoopback,
  type OpenRouterLoopbackShape,
  type RecordedRequest,
} from './__fixtures__/openrouter-loopback.fixture.js'

const Feature = makeFeature({ it, layer })

const pack = new PackEval.Pack({
  id: 'greenhouse',
  rules: [
    new PackEval.PackRule({
      packId: 'greenhouse',
      stem: 'watering-schedule',
      title: 'Water on a schedule',
      appliesWhen: ['touching the watering plan'],
      tags: ['water'],
      body: 'Water every second morning and write the amount in the log.',
    }),
    new PackEval.PackRule({
      packId: 'greenhouse',
      stem: 'night-venting',
      title: 'Keep the air moving at night',
      appliesWhen: ['closing the vents for the night'],
      tags: ['air'],
      body: 'Leave one vent open a hand width after the last walk-through.',
    }),
  ],
})

const task = new PackEval.Task({
  id: 'task-trellis',
  text: 'Tie the tomato shoots to the trellis before the weekend',
  split: 'dev',
  dimensions: { crop: 'tomato' },
})

const instruction = new PackEval.SelectorInstruction({
  text: 'Load every rule whose applies_when matches the work the task describes.',
  provenance: new PackEval.SelectorProvenance({
    consumer: 'greenkeeper',
    pluginVersion: '1.0.0',
    sourcePath: 'references/agents/greenkeeper.md',
  }),
})

const request: PackEval.RuleSelectionRequest = { pack, task, instruction }

const askedModel = 'acme/planner-large'
const otherModel = 'acme/planner-small'
const servedModel = 'acme/planner-large@acme'

const answerTextOf = Schema.encodeEffect(Schema.fromJsonString(PackEval.LoadedStems))

const stemsReply = (loaded: ReadonlyArray<string>): Effect.Effect<LoopbackReply, Schema.SchemaError> =>
  Effect.map(answerTextOf({ loaded }), (content) => ({
    status: 200,
    body: {
      id: 'gen-loopback-1',
      object: 'chat.completion',
      created: 1_760_000_000,
      model: servedModel,
      system_fingerprint: null,
      choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content } }],
    },
  }))

const refusedReply: Effect.Effect<LoopbackReply, Schema.SchemaError> = Effect.succeed({
  status: 500,
  body: { error: { message: 'upstream is down' } },
})

interface World {
  readonly provider: OpenRouterLoopbackShape
  readonly cacheDir: string
}

const worldWith = (replies: ReadonlyArray<Effect.Effect<LoopbackReply, Schema.SchemaError>>) =>
  Effect.gen(function*() {
    const provider = yield* OpenRouterLoopback
    const fileSystem = yield* FileSystem.FileSystem
    yield* provider.answerWith(yield* Effect.all(replies))
    const cacheDir = yield* fileSystem.makeTempDirectoryScoped()
    return { provider, cacheDir } satisfies World
  })

const selectorStack = (world: World, model: string) =>
  Layer.provideMerge(
    Layer.provideMerge(
      Layer.provideMerge(
        PackEval.OpenRouterRuleSelector.layer({ model }),
        PackEval.FileAnswerCache.layer({ cacheDir: world.cacheDir }),
      ),
      OpenRouterLanguageModel.layer({ model }),
    ),
    OpenRouterClient.layer({ apiUrl: world.provider.apiUrl, apiKey: Redacted.make('sk-loopback') }),
  )

const selectOnce = (world: World, model: string) =>
  Effect.gen(function*() {
    const selector = yield* PackEval.RuleSelector
    return yield* selector.select(request)
  }).pipe(Effect.provide(selectorStack(world, model)))

const questionOf = (requests: ReadonlyArray<RecordedRequest>): string => requests[0]?.text ?? ''

Feature('Deciding which pack rules govern a piece of work')
  .withScenarioLayer(openRouterLoopback)
  .body(({ scenario }) => {
    scenario(
      'A trellis question is answered with the watering rule alone',
      Gherkin.Do.pipe(
        Given('a pack offering two rules by title and by when they apply, and a task about the tomato trellis')(
          'world',
          () => worldWith([stemsReply(['watering-schedule'])]),
        ),
        When('the selector is asked which rules govern the task')('outcome', (s) =>
          Effect.gen(function*() {
            const selection = yield* selectOnce(s.world, askedModel)
            const asked = yield* s.world.provider.requests
            return { selection, asked }
          })),
        Then('the question carried the instruction, both rule titles, when each applies, and the task')((s) => {
          const question = questionOf(s.outcome.asked)
          expect(question).toContain(instruction.text)
          expect(question).toContain('Water on a schedule')
          expect(question).toContain('touching the watering plan')
          expect(question).toContain('Keep the air moving at night')
          expect(question).toContain('closing the vents for the night')
          expect(question).toContain(task.text)
        }),
        Then('the question never carried the guidance written under a rule')((s) => {
          const question = questionOf(s.outcome.asked)
          expect(question).not.toContain('Water every second morning and write the amount in the log.')
          expect(question).not.toContain('Leave one vent open a hand width after the last walk-through.')
        }),
        Then('the answer names the watering rule alone, and the model the provider says it served')((s) => {
          expect(s.outcome.selection.loadedStems).toEqual(['watering-schedule'])
          expect(s.outcome.selection.servedModel).toBe(servedModel)
          expect(s.outcome.selection.requestedModel).toBe(askedModel)
        }),
      ),
    )

    scenario(
      'An answer naming a rule the pack does not hold is refused before anything is scored',
      Gherkin.Do.pipe(
        Given('a provider that answers with a rule the pack does not hold')(
          'world',
          () => worldWith([stemsReply(['compost-tea'])]),
        ),
        When('the selector is asked which rules govern the task')(
          'refusal',
          (s) => Effect.flip(selectOnce(s.world, askedModel)),
        ),
        Then('the answer is refused, and names the rule the pack does not hold')((s) => {
          expect(s.refusal).toMatchObject({ _tag: 'UnknownSelectedStem', stem: 'compost-tea', packId: 'greenhouse' })
        }),
      ),
    )

    scenario(
      'A provider that refuses the call is reported, and no selection is made',
      Gherkin.Do.pipe(
        Given('a provider that refuses every call')('world', () => worldWith([refusedReply])),
        When('the selector is asked which rules govern the task')(
          'refusal',
          (s) => Effect.flip(selectOnce(s.world, askedModel)),
        ),
        Then('the refusal says the provider failed, and no rules were named')((s) => {
          expect(s.refusal).toMatchObject({ _tag: 'ProviderFailure', role: 'selector', model: askedModel })
          expect(s.refusal).not.toMatchObject({ _tag: 'UnknownSelectedStem' })
        }),
      ),
    )

    scenario(
      'Asking about the same work twice reaches the provider once',
      Gherkin.Do.pipe(
        Given('a provider that answers with the watering rule, and answers kept in a scratch folder')(
          'world',
          () => worldWith([stemsReply(['watering-schedule'])]),
        ),
        When('the same work is asked twice')('second', (s) =>
          Effect.gen(function*() {
            const first = yield* selectOnce(s.world, askedModel)
            const again = yield* selectOnce(s.world, askedModel)
            const asked = yield* s.world.provider.requestCount
            return { first, again, asked }
          })),
        Then('the provider is asked once, and both answers agree')((s) => {
          expect(s.second.asked).toBe(1)
          expect(s.second.again).toEqual(s.second.first)
        }),
      ),
    )

    scenario(
      'The same work asked under two models keeps each answer apart',
      Gherkin.Do.pipe(
        Given('a provider that answers with the watering rule')(
          'world',
          () => worldWith([stemsReply(['watering-schedule'])]),
        ),
        When('the same work is asked under two different models')('second', (s) =>
          Effect.gen(function*() {
            const fileSystem = yield* FileSystem.FileSystem
            const path = yield* Path.Path
            const underFirst = yield* selectOnce(s.world, askedModel)
            const underSecond = yield* selectOnce(s.world, otherModel)
            const asked = yield* s.world.provider.requestCount
            const kept = yield* fileSystem.readDirectory(path.join(s.world.cacheDir, 'selector'))
            return { underFirst, underSecond, asked, kept }
          })),
        Then('each model was asked for itself, and both answers were kept')((s) => {
          expect(s.second.asked).toBe(2)
          expect(s.second.underFirst.servedModel).toBe(servedModel)
          expect(s.second.underSecond.servedModel).toBe(servedModel)
          expect(s.second.kept).toHaveLength(2)
        }),
      ),
    )
  })
