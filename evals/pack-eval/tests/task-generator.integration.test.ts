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

const askedModel = 'acme/drafter-small'
const servedModel = 'acme/drafter-small@acme'

const dimensions = [
  new PackEval.Dimension({ name: 'job', captures: 'the work being done', values: ['watering', 'pruning', 'feeding'] }),
  new PackEval.Dimension({ name: 'pace', captures: 'how the day is going', values: ['steady', 'rushed'] }),
]

const seeds: ReadonlyArray<PackEval.DimensionTuple> = [{ job: 'watering', pace: 'steady' }]

const tuplesTextOf = Schema.encodeEffect(Schema.fromJsonString(PackEval.ProposedRows))

const tuplesReply = (
  rows: ReadonlyArray<ReadonlyArray<PackEval.TupleEntry>>,
): Effect.Effect<LoopbackReply, Schema.SchemaError> =>
  Effect.map(tuplesTextOf({ tuples: rows }), (content) => ({
    status: 200,
    body: {
      id: 'gen-loopback-2',
      object: 'chat.completion',
      created: 1_760_000_000,
      model: servedModel,
      system_fingerprint: null,
      choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content } }],
    },
  }))

const answered = tuplesReply([[{ name: 'job', value: 'pruning' }, { name: 'pace', value: 'rushed' }]])

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

const generatorStack = (world: World) =>
  Layer.provideMerge(
    Layer.provideMerge(
      Layer.provideMerge(
        PackEval.OpenRouterTaskGenerator.layer({ model: askedModel }),
        PackEval.FileAnswerCache.layer({ cacheDir: world.cacheDir }),
      ),
      OpenRouterLanguageModel.layer({ model: askedModel }),
    ),
    OpenRouterClient.layer({ apiUrl: world.provider.apiUrl, apiKey: Redacted.make('sk-loopback') }),
  )

const proposeOnce = (world: World) =>
  Effect.gen(function*() {
    const generator = yield* PackEval.TaskGenerator
    return yield* generator.proposeTuples({
      application: 'a greenhouse diary',
      dimensions,
      seeds,
    })
  }).pipe(Effect.provide(generatorStack(world)))

const questionOf = (requests: ReadonlyArray<RecordedRequest>): string => requests[0]?.text ?? ''

Feature('Growing a task set from owner dimensions')
  .withScenarioLayer(openRouterLoopback)
  .body(({ scenario }) => {
    scenario(
      'A proposal is asked from the dimensions and the tuples already chosen',
      Gherkin.Do.pipe(
        Given('a generator holding the dimensions of the diary and the tuples already chosen')(
          'world',
          () => worldWith([answered]),
        ),
        When('the owner asks for more dimension tuples')('outcome', (s) =>
          Effect.gen(function*() {
            const fileSystem = yield* FileSystem.FileSystem
            const path = yield* Path.Path
            const proposal = yield* proposeOnce(s.world)
            const asked = yield* s.world.provider.requests
            const kept = yield* fileSystem.readDirectory(path.join(s.world.cacheDir, 'generator'))
            const selectorFolder = yield* fileSystem.exists(path.join(s.world.cacheDir, 'selector'))
            return { proposal, asked, kept, selectorFolder }
          })),
        Then('the question carried every dimension, its possible values, and the tuples already chosen')((s) => {
          const question = questionOf(s.outcome.asked)
          expect(question).toContain('job: the work being done. Possible values: watering, pruning, feeding')
          expect(question).toContain('pace: how the day is going. Possible values: steady, rushed')
          expect(question).toContain('(job: watering, pace: steady)')
        }),
        Then('the proposal names what the provider answered, and is kept in the generator folder alone')((s) => {
          expect(s.outcome.proposal.tuples).toEqual([{ job: 'pruning', pace: 'rushed' }])
          expect(s.outcome.kept).toHaveLength(1)
          expect(s.outcome.selectorFolder).toBe(false)
        }),
      ),
    )
  })
