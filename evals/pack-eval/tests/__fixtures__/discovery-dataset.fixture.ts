import { OpenRouterClient, OpenRouterLanguageModel } from '@effect/ai-openrouter'
import { PackEval } from '@systemfsoftware/pack-eval'
import { Effect, Layer, Redacted, Schema } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import * as Path from 'effect/Path'
import type { LoopbackReply, OpenRouterLoopbackShape } from './openrouter-loopback.fixture.js'
import { materialize, type MaterializedWorld } from './pack-eval-disk.fixture.js'
import {
  plannerModel,
  servedPlannerModel,
  type World,
  type WorldDimension,
  type WorldGeneratorTaskReply,
  type WorldSelectorReply,
  type WorldTuple,
} from './pack-eval-world.fixture.js'

/** The scripted tasks the world's generator writes, or none when it refuses. */
export const generatedTasksOf = (world: World): ReadonlyArray<WorldGeneratorTaskReply> =>
  world.answers.generator.kind === 'proposed' ? world.answers.generator.writtenTasks : []

const proposedTuplesOf = (world: World): ReadonlyArray<WorldTuple> =>
  world.answers.generator.kind === 'proposed' ? world.answers.generator.proposedTuples : []

const describedDimensionsOf = (world: World): ReadonlyArray<WorldDimension> =>
  world.dimensions !== undefined && world.dimensions.kind === 'described' ? world.dimensions.dimensions : []

/** The dimension names the world's generator prompt names, per KTD7's content matching. */
export const dimensionNamesOf = (world: World): string =>
  `(${describedDimensionsOf(world).map((dimension) => dimension.name).join(', ')})`

const completionOf = (content: string): LoopbackReply => ({
  status: 200,
  body: {
    id: 'discovery-loopback',
    object: 'chat.completion',
    created: 1_760_000_000,
    model: servedPlannerModel,
    system_fingerprint: null,
    choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content } }],
  },
})

const rowsOf = (
  tuples: ReadonlyArray<WorldTuple>,
): ReadonlyArray<ReadonlyArray<Record<'name' | 'value', string>>> =>
  tuples.map((tuple) => Object.entries(tuple).map(([name, value]) => ({ name, value })))

const proposedRowsJson = Schema.fromJsonString(PackEval.ProposedRows)
const generatedTaskJson = Schema.fromJsonString(PackEval.GeneratedTask)

const tuplesReply = (
  tuples: ReadonlyArray<WorldTuple>,
): Effect.Effect<LoopbackReply, Schema.SchemaError> =>
  Effect.map(Schema.encodeEffect(proposedRowsJson)({ tuples: rowsOf(tuples) }), completionOf)

const taskReply = (text: string): Effect.Effect<LoopbackReply, Schema.SchemaError> =>
  Effect.map(Schema.encodeEffect(generatedTaskJson)({ text }), completionOf)

/** The replies the world's generator asks for, in the order it asks them. */
export const generatorRepliesOf = (
  world: World,
): Effect.Effect<ReadonlyArray<LoopbackReply>, Schema.SchemaError> =>
  Effect.all([
    tuplesReply(proposedTuplesOf(world)),
    ...generatedTasksOf(world).map((written) => taskReply(written.text)),
  ])

/** The scripted stems the world answers with for one traced task. */
export const selectorStemsOf = (options: { readonly world: World; readonly taskId: string }): ReadonlyArray<string> =>
  options.world.answers.selector.flatMap((reply: WorldSelectorReply) =>
    reply.kind === 'selected' && reply.taskId === options.taskId ? reply.stems : []
  )

export const generationScenarioOf = (world: World) =>
  Effect.gen(function*() {
    const materialized: MaterializedWorld = yield* materialize(world)
    yield* materialized.provider.answerWith(yield* generatorRepliesOf(world))
    return { world, materialized }
  })

export const tracingScenarioOf = (world: World) =>
  Effect.map(materialize(world), (materialized) => ({ world, materialized }))

/** The generator's dependencies against the scenario's cache and loopback provider. */
export const generatorStack = (options: {
  readonly cacheDir: string
  readonly provider: OpenRouterLoopbackShape
}) =>
  Layer.provideMerge(
    Layer.provideMerge(
      Layer.provideMerge(
        PackEval.OpenRouterTaskGenerator.layer({ model: plannerModel }),
        PackEval.FileAnswerCache.layer({ cacheDir: options.cacheDir }),
      ),
      OpenRouterLanguageModel.layer({ model: plannerModel }),
    ),
    OpenRouterClient.layer({ apiUrl: options.provider.apiUrl, apiKey: Redacted.make('sk-loopback') }),
  )

/** The selector's dependencies against the scenario's cache and loopback provider. */
export const selectorStack = (options: {
  readonly cacheDir: string
  readonly provider: OpenRouterLoopbackShape
}) =>
  Layer.provideMerge(
    Layer.provideMerge(
      Layer.provideMerge(
        PackEval.OpenRouterRuleSelector.layer({ model: plannerModel }),
        PackEval.FileAnswerCache.layer({ cacheDir: options.cacheDir }),
      ),
      OpenRouterLanguageModel.layer({ model: plannerModel }),
    ),
    OpenRouterClient.layer({ apiUrl: options.provider.apiUrl, apiKey: Redacted.make('sk-loopback') }),
  )

/** The refused ask the dimensions failure leaves behind. */
export const refusedPathOf = (error: PackEval.DatasetFileRefusal | PackEval.TaskGenerationError): string =>
  Schema.is(PackEval.DatasetFileRefusal)(error) ? error.path : ''

export const candidatesOf = (options: { readonly workDir: string }) =>
  Effect.gen(function*() {
    const paths = yield* Path.Path
    return yield* PackEval.DatasetFiles.readJson(
      paths.join(options.workDir, 'candidates.json'),
      PackEval.CandidateTasks,
    )
  })

/** The trace file names the run wrote under the world's pack. */
export const traceNamesOf = (options: { readonly workDir: string; readonly packId: string }) =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem
    const paths = yield* Path.Path
    return yield* fileSystem.readDirectory(paths.join(options.workDir, 'traces', options.packId))
  })

/** The trace the run wrote for one task and pack. */
export const traceOf = (options: { readonly workDir: string; readonly packId: string; readonly taskId: string }) =>
  Effect.gen(function*() {
    const paths = yield* Path.Path
    return yield* PackEval.DatasetFiles.readJson(
      paths.join(options.workDir, PackEval.DatasetFiles.traceRelativePathOf(options.packId, options.taskId)),
      PackEval.SelectionTrace,
    )
  })

export const fileTextOf = (options: { readonly path: string }) =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem
    return yield* fileSystem.readFileString(options.path)
  })

export const pathExists = (options: { readonly segments: ReadonlyArray<string> }) =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem
    const paths = yield* Path.Path
    return yield* fileSystem.exists(paths.join(...options.segments))
  })
export const packIdOf = (world: World): string =>
  world.packs.length === 1 && world.packs[0] !== undefined ? world.packs[0].id : 'missing-pack'
