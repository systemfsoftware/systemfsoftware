import { OpenRouterClient, OpenRouterLanguageModel } from '@effect/ai-openrouter'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { PackEval } from '@systemfsoftware/pack-eval'
import { Effect, Layer, Match, Redacted, Result, Schema } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import * as Path from 'effect/Path'
import {
  completionReplyOf,
  type LoopbackReply,
  OpenRouterLoopback,
  openRouterLoopback,
  type OpenRouterLoopbackShape,
} from './__fixtures__/openrouter-loopback.fixture.js'
import {
  discoveryWorld,
  withProviderRefusal,
  type World,
  type WorldTuple,
} from './__fixtures__/pack-eval-world.fixture.js'

const Feature = makeFeature({ it, layer })

const askedModel = 'acme/drafter-small'
const servedModel = 'acme/drafter-small@acme'

const headOf = <T>(values: ReadonlyArray<T>, what: string): T => {
  const [first] = values
  if (first === undefined) throw new Error(`the discovery world holds no ${what}`)
  return first
}

const proposalRequestOf = (world: World): PackEval.TupleProposalRequest => {
  const dimensions = world.dimensions
  if (dimensions === undefined || dimensions.kind !== 'described') {
    throw new Error('the discovery world holds no described dimensions')
  }
  return {
    application: dimensions.application,
    dimensions: dimensions.dimensions.map((dimension) =>
      new PackEval.Dimension({
        name: dimension.name,
        captures: dimension.captures,
        values: [headOf(dimension.values, 'dimension values'), ...dimension.values.slice(1)],
      })
    ),
    seeds: dimensions.seeds,
  }
}

const rowsTextOf = Schema.encodeEffect(Schema.fromJsonString(PackEval.ProposedRows))

const answerOf = (content: string): LoopbackReply => completionReplyOf({ content, servedModel })

const proposedReplyOf = (tuples: ReadonlyArray<WorldTuple>, names: ReadonlyArray<string>) =>
  Effect.map(
    rowsTextOf({ tuples: tuples.map((tuple) => names.map((name) => ({ name, value: tuple[name] ?? '' }))) }),
    answerOf,
  )

const refusedReply: LoopbackReply = {
  status: 500,
  body: { error: { message: 'upstream is down' } },
}

interface GeneratorWorld {
  readonly provider: OpenRouterLoopbackShape
  readonly cacheDir: string
  readonly request: PackEval.TupleProposalRequest
  readonly world: World
}

const scriptedWorldOf = (world: World, reply: Effect.Effect<LoopbackReply, Schema.SchemaError>) =>
  Effect.gen(function*() {
    const provider = yield* OpenRouterLoopback
    const fileSystem = yield* FileSystem.FileSystem
    yield* provider.answerWith([yield* reply])
    const cacheDir = yield* fileSystem.makeTempDirectoryScoped()
    return { provider, cacheDir, request: proposalRequestOf(world), world } satisfies GeneratorWorld
  })

const stackOf = (world: GeneratorWorld) =>
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

const proposeWith = (world: GeneratorWorld) =>
  Effect.gen(function*() {
    const generator = yield* PackEval.TaskGenerator
    return yield* generator.proposeTuples(world.request)
  }).pipe(Effect.provide(stackOf(world)))

const generatorRows = [
  { reply: 'proposed tuples', refused: false },
  { reply: 'a provider refusal', refused: true },
] as const

Feature('Growing a task set from owner dimensions')
  .withScenarioLayer(openRouterLoopback)
  .body(({ scenarioOutline }) => {
    scenarioOutline(
      'A proposal asked from the dimensions comes back <reply>',
      generatorRows,
      (row) =>
        Gherkin.Do.pipe(
          Given('the diary dimensions, the tuples already chosen, and a scripted reply')(
            'world',
            () => {
              const world = row.refused
                ? withProviderRefusal({ role: 'generator' })(discoveryWorld())
                : discoveryWorld()
              const names = world.dimensions !== undefined && world.dimensions.kind === 'described'
                ? world.dimensions.dimensions.map((dimension) => dimension.name)
                : []
              return scriptedWorldOf(
                world,
                Match.value(row.refused).pipe(
                  Match.when(true, () => Effect.succeed(refusedReply)),
                  Match.when(false, () =>
                    proposedReplyOf(
                      headOf(
                        world.answers.generator.kind === 'proposed' ? [world.answers.generator] : [],
                        'generator answer',
                      )
                        .proposedTuples,
                      names,
                    )),
                  Match.exhaustive,
                ),
              )
            },
          ),
          When('the owner asks for more dimension tuples')('outcome', (s) =>
            Effect.gen(function*() {
              const fileSystem = yield* FileSystem.FileSystem
              const path = yield* Path.Path
              const attempt = yield* Effect.result(proposeWith(s.world))
              const asked = yield* s.world.provider.requests
              if (Result.isFailure(attempt)) {
                const kept: ReadonlyArray<string> = []
                return { attempt, asked, kept, selectorFolder: false }
              }
              const kept = yield* fileSystem.readDirectory(path.join(s.world.cacheDir, 'generator'))
              const selectorFolder = yield* fileSystem.exists(path.join(s.world.cacheDir, 'selector'))
              return { attempt, asked, kept, selectorFolder }
            })),
          Then('the proposal, or the refusal, matches the scripted reply')((s) =>
            Match.value(row.refused).pipe(
              Match.when(true, () => {
                const refusal = Result.getOrThrow(Result.flip(s.outcome.attempt))
                expect(refusal).toMatchObject({ _tag: 'ProviderFailure', role: 'generator', model: askedModel })
              }),
              Match.when(false, () => {
                const proposal = Result.getOrThrow(s.outcome.attempt)
                const expected = s.world.world.answers.generator
                if (expected.kind !== 'proposed') throw new Error('the proposed row holds no proposed answer')
                expect(proposal.tuples).toEqual(expected.proposedTuples)
                expect(s.outcome.kept).toHaveLength(1)
                expect(s.outcome.selectorFolder).toBe(false)
              }),
              Match.exhaustive,
            )
          ),
        ),
    )
  })
