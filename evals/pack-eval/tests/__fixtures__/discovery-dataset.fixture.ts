import { OpenRouterClient, OpenRouterLanguageModel } from '@effect/ai-openrouter'
import { PackEval } from '@systemfsoftware/pack-eval'
import { Effect, Layer, Option, Redacted, Schema } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import * as Path from 'effect/Path'
import { type LoopbackReply, OpenRouterLoopback, type OpenRouterLoopbackShape } from './openrouter-loopback.fixture.js'

export const askedModel = 'acme/planner-large'
export const servedModel = 'acme/planner-large@acme'

export const discoveryPackId = 'greenhouse'

export interface RuleSource {
  readonly stem: string
  readonly title: string
  readonly appliesWhen: ReadonlyArray<string>
  readonly tags: ReadonlyArray<string>
  readonly body: string
}

export const ruleTextOf = (rule: RuleSource): string =>
  [
    '---',
    `title: ${rule.title}`,
    `applies_when: [${rule.appliesWhen.join(', ')}]`,
    `tags: [${rule.tags.join(', ')}]`,
    '---',
    '',
    rule.body,
    '',
  ].join('\n')

const completionOf = (content: string): Schema.Json => ({
  id: 'discovery-loopback',
  object: 'chat.completion',
  created: 1_760_000_000,
  model: servedModel,
  system_fingerprint: null,
  choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content } }],
})

const proposedRowsJson = Schema.fromJsonString(PackEval.ProposedRows)
const generatedTaskJson = Schema.fromJsonString(PackEval.GeneratedTask)
const loadedStemsJson = Schema.fromJsonString(PackEval.LoadedStems)

const completionReply = (
  content: Effect.Effect<string, Schema.SchemaError>,
): Effect.Effect<LoopbackReply, Schema.SchemaError> =>
  Effect.map(content, (text) => ({ status: 200, body: completionOf(text) }))

export const rowsOf = (
  tuples: ReadonlyArray<PackEval.DimensionTuple>,
): ReadonlyArray<ReadonlyArray<PackEval.TupleEntry>> =>
  tuples.map((tuple) => Object.entries(tuple).map(([name, value]) => ({ name, value })))

export const tuplesReply = (
  tuples: ReadonlyArray<PackEval.DimensionTuple>,
): Effect.Effect<LoopbackReply, Schema.SchemaError> =>
  completionReply(Schema.encodeEffect(proposedRowsJson)({ tuples: rowsOf(tuples) }))

export const taskReply = (text: string): Effect.Effect<LoopbackReply, Schema.SchemaError> =>
  completionReply(Schema.encodeEffect(generatedTaskJson)({ text }))

export const stemsReply = (loaded: ReadonlyArray<string>): Effect.Effect<LoopbackReply, Schema.SchemaError> =>
  completionReply(Schema.encodeEffect(loadedStemsJson)({ loaded }))

export interface DiscoveryWorld {
  readonly provider: OpenRouterLoopbackShape
  readonly datasetDir: string
  readonly packDir: string
  readonly workDir: string
  readonly cacheDir: string
}

export interface DiscoveryLayout {
  readonly replies: ReadonlyArray<Effect.Effect<LoopbackReply, Schema.SchemaError>>
  readonly dimensions?: PackEval.TaskDimensions | undefined
  readonly rawDimensions?: string | undefined
  readonly tasks?: PackEval.TaskSet | undefined
  readonly instruction?: PackEval.SelectorInstruction | undefined
  readonly rules?: ReadonlyArray<RuleSource> | undefined
}

export const discoveryWorld = (layout: DiscoveryLayout) =>
  Effect.gen(function*() {
    const provider = yield* OpenRouterLoopback
    const fileSystem = yield* FileSystem.FileSystem
    const paths = yield* Path.Path
    yield* provider.answerWith(yield* Effect.all(layout.replies))
    const base = yield* fileSystem.makeTempDirectoryScoped()
    const datasetDir = paths.join(base, 'dataset')
    const packDir = paths.join(base, 'packs', discoveryPackId)
    const workDir = paths.join(base, 'work')
    const dimensionsPath = paths.join(datasetDir, 'dimensions.json')
    yield* fileSystem.makeDirectory(packDir, { recursive: true })
    yield* fileSystem.makeDirectory(datasetDir, { recursive: true })
    yield* Effect.forEach(
      layout.rules ?? [],
      (rule) => fileSystem.writeFileString(paths.join(packDir, `${rule.stem}.md`), ruleTextOf(rule)),
      { discard: true },
    )
    yield* Option.match(Option.fromUndefinedOr(layout.dimensions), {
      onNone: () => Effect.void,
      onSome: (dimensions) => PackEval.DatasetFiles.writeJson(dimensionsPath, PackEval.TaskDimensions, dimensions),
    })
    yield* Option.match(Option.fromUndefinedOr(layout.rawDimensions), {
      onNone: () => Effect.void,
      onSome: (text) => fileSystem.writeFileString(dimensionsPath, text),
    })
    yield* Option.match(Option.fromUndefinedOr(layout.tasks), {
      onNone: () => Effect.void,
      onSome: (tasks) => PackEval.DatasetFiles.writeJson(paths.join(datasetDir, 'tasks.json'), PackEval.TaskSet, tasks),
    })
    yield* Option.match(Option.fromUndefinedOr(layout.instruction), {
      onNone: () => Effect.void,
      onSome: (instruction) =>
        PackEval.DatasetFiles.writeJson(
          paths.join(datasetDir, 'selector-instruction.json'),
          PackEval.SelectorInstruction,
          instruction,
        ),
    })
    const cacheDir = yield* fileSystem.makeTempDirectoryScoped()
    return { provider, datasetDir, packDir, workDir, cacheDir }
  })

export const generatorStack = (world: DiscoveryWorld) =>
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

export const selectorStack = (world: DiscoveryWorld) =>
  Layer.provideMerge(
    Layer.provideMerge(
      Layer.provideMerge(
        PackEval.OpenRouterRuleSelector.layer({ model: askedModel }),
        PackEval.FileAnswerCache.layer({ cacheDir: world.cacheDir }),
      ),
      OpenRouterLanguageModel.layer({ model: askedModel }),
    ),
    OpenRouterClient.layer({ apiUrl: world.provider.apiUrl, apiKey: Redacted.make('sk-loopback') }),
  )

export const candidatesAt = (workDir: string) =>
  Effect.gen(function*() {
    const paths = yield* Path.Path
    return yield* PackEval.DatasetFiles.readJson(paths.join(workDir, 'candidates.json'), PackEval.CandidateTasks)
  })

export const traceAt = (options: { readonly workDir: string; readonly packId: string; readonly taskId: string }) =>
  Effect.gen(function*() {
    const paths = yield* Path.Path
    return yield* PackEval.DatasetFiles.readJson(
      paths.join(options.workDir, PackEval.DatasetFiles.traceRelativePathOf(options.packId, options.taskId)),
      PackEval.SelectionTrace,
    )
  })

export const traceNamesAt = (options: { readonly workDir: string; readonly packId: string }) =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem
    const paths = yield* Path.Path
    return yield* fileSystem.readDirectory(paths.join(options.workDir, 'traces', options.packId))
  })

export const candidatesFileExists = (workDir: string) =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem
    const paths = yield* Path.Path
    return yield* fileSystem.exists(paths.join(workDir, 'candidates.json'))
  })

export const pathExists = (...segments: ReadonlyArray<string>) =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem
    const paths = yield* Path.Path
    return yield* fileSystem.exists(paths.join(...segments))
  })

export const taskSetExists = (datasetDir: string) =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem
    const paths = yield* Path.Path
    return yield* fileSystem.exists(paths.join(datasetDir, 'tasks.json'))
  })

export const dimensionsPathAt = (datasetDir: string) =>
  Effect.map(Path.Path, (paths) => paths.join(datasetDir, 'dimensions.json'))
