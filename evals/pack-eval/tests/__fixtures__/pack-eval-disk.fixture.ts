import { PackEval } from '@systemfsoftware/pack-eval'
import { Effect, Schema } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import * as Path from 'effect/Path'
import {
  completionBodyOf,
  type LoopbackReply,
  OpenRouterLoopback,
  type OpenRouterLoopbackShape,
  type QuestionKey,
  type ScriptedAnswer,
} from './openrouter-loopback.fixture.js'
import { writeCandidateTasksOf, writeDatasetFilesOf, writeSelectionTracesOf } from './pack-eval-dataset.fixture.js'
import { defaultEvidenceFloor } from './pack-eval-oracle.fixture.js'
import {
  ruleTextOf,
  type World,
  type WorldJudgeReply,
  type WorldProviderRefusal,
  type WorldSelectorReply,
} from './pack-eval-world.fixture.js'

const materializedSelectorModel = 'acme/planner-large'
const materializedJudgeModel = 'acme/judge-large'
const materializedJudgeMinimum = 0.8
const materializedProvider = 'openrouter'
export const materializedSeed = 7
export const materializedIterations = 200
const materializedConfidence = 0.95

interface MaterializedPack {
  readonly id: string
  readonly dir: string
}

export interface MaterializedWorld {
  readonly base: string
  readonly datasetDir: string
  readonly workDir: string
  readonly cacheDir: string
  readonly reportPath: string
  readonly packs: ReadonlyArray<MaterializedPack>
  readonly packDirs: ReadonlyArray<string>
  readonly provider: OpenRouterLoopbackShape
  readonly request: PackEval.EvaluatePacks.EvaluatePacksRequest
}

const refusalReplyOf = (refusal: WorldProviderRefusal): LoopbackReply => ({
  status: refusal.status,
  body: { error: refusal.message },
})

const loadedStemsJson = Schema.fromJsonString(PackEval.LoadedStems)
const judgeReplyJson = Schema.fromJsonString(PackEval.JudgeReply)

const nonEmptyTupleOf = <T>(values: ReadonlyArray<T>): readonly [T, ...T[]] | undefined => {
  const first = values[0]
  return first === undefined ? undefined : [first, ...values.slice(1)]
}

type WorldSelectedReply = Extract<WorldSelectorReply, { readonly kind: 'selected' }>
type WorldRefusedSelectorReply = Extract<WorldSelectorReply, { readonly kind: 'refused' }>
type WorldJudgedReply = Extract<WorldJudgeReply, { readonly kind: 'judged' }>
type WorldRefusedJudgeReply = Extract<WorldJudgeReply, { readonly kind: 'refused' }>

const selectorKeyOf = (world: World, reply: WorldSelectedReply | WorldRefusedSelectorReply): QuestionKey => ({
  role: 'selector',
  contains: [
    world.tasks.find((task) => task.id === reply.taskId)?.text ?? reply.taskId,
    reply.packId,
  ],
})

const judgeKeyOf = (world: World, reply: WorldJudgedReply | WorldRefusedJudgeReply): QuestionKey => ({
  role: 'judge',
  contains: [
    world.tasks.find((task) => task.id === reply.question.taskId)?.text ?? reply.question.taskId,
    reply.question.ruleA,
    reply.question.ruleB,
    ...(reply.question.plantedBody === undefined ? [] : [reply.question.plantedBody]),
  ],
})

const selectedAnswerOf = (world: World, reply: WorldSelectedReply) =>
  Effect.map(
    Schema.encodeEffect(loadedStemsJson)({ loaded: reply.stems }),
    (content): ScriptedAnswer => ({
      key: selectorKeyOf(world, reply),
      reply: { status: 200, body: completionBodyOf({ content, servedModel: reply.servedModel }) },
    }),
  )

const refusedSelectorAnswerOf = (world: World, reply: WorldRefusedSelectorReply): ScriptedAnswer => ({
  key: selectorKeyOf(world, reply),
  reply: refusalReplyOf(reply.refusal),
})

const judgedAnswerOf = (world: World, reply: WorldJudgedReply) =>
  Effect.map(
    Schema.encodeEffect(judgeReplyJson)({ critique: reply.critique, verdict: reply.verdict }),
    (content): ScriptedAnswer => ({
      key: judgeKeyOf(world, reply),
      reply: { status: 200, body: completionBodyOf({ content, servedModel: reply.servedModel }) },
    }),
  )

const refusedJudgeAnswerOf = (world: World, reply: WorldRefusedJudgeReply): ScriptedAnswer => ({
  key: judgeKeyOf(world, reply),
  reply: refusalReplyOf(reply.refusal),
})

const scriptedAnswersOf = (
  world: World,
): Effect.Effect<ReadonlyArray<ScriptedAnswer>, Schema.SchemaError> =>
  Effect.all([
    ...world.answers.selector.map((reply) =>
      reply.kind === 'selected'
        ? selectedAnswerOf(world, reply)
        : Effect.succeed(refusedSelectorAnswerOf(world, reply))
    ),
    ...world.answers.judge.map((reply) =>
      reply.kind === 'judged'
        ? judgedAnswerOf(world, reply)
        : Effect.succeed(refusedJudgeAnswerOf(world, reply))
    ),
  ])

const taskDimensionsOf = (world: World): PackEval.TaskDimensions | undefined => {
  const described = world.dimensions
  if (described === undefined || described.kind !== 'described') return undefined
  const dimensions = nonEmptyTupleOf(described.dimensions.flatMap((dimension) => {
    const values = nonEmptyTupleOf(dimension.values)
    return values === undefined
      ? []
      : [new PackEval.Dimension({ name: dimension.name, captures: dimension.captures, values })]
  }))
  if (dimensions === undefined) return undefined
  return new PackEval.TaskDimensions({
    version: 1,
    application: described.application,
    dimensions,
    seeds: described.seeds,
  })
}

const writeDimensions = (fileSystem: FileSystem.FileSystem, paths: Path.Path, datasetDir: string, world: World) => {
  const dimensions = world.dimensions
  if (dimensions === undefined) return Effect.void
  const dimensionsPath = paths.join(datasetDir, 'dimensions.json')
  if (dimensions.kind === 'raw') {
    return Effect.asVoid(fileSystem.writeFileString(dimensionsPath, dimensions.text))
  }
  const described = taskDimensionsOf(world)
  if (described === undefined) return Effect.void
  return PackEval.DatasetFiles.writeJson(dimensionsPath, PackEval.TaskDimensions, described)
}

const writeRules = (world: World, fileSystem: FileSystem.FileSystem, paths: Path.Path, base: string) =>
  Effect.forEach(
    world.packs,
    (pack) =>
      Effect.gen(function*() {
        const dir = paths.join(base, 'packs', pack.id)
        yield* fileSystem.makeDirectory(dir, { recursive: true })
        yield* Effect.forEach(
          pack.rules,
          (rule) => fileSystem.writeFileString(paths.join(dir, `${rule.stem}.md`), ruleTextOf(rule)),
          { discard: true },
        )
        return { id: pack.id, dir } satisfies MaterializedPack
      }),
  )

export const materialize = (world: World) =>
  Effect.gen(function*() {
    const provider = yield* OpenRouterLoopback
    const fileSystem = yield* FileSystem.FileSystem
    const paths = yield* Path.Path

    const base = yield* fileSystem.makeTempDirectoryScoped()
    const datasetDir = paths.join(base, 'dataset')
    const workDir = paths.join(base, 'work')
    const cacheDir = paths.join(base, 'cache')
    const reportPath = paths.join(base, 'report.json')
    yield* fileSystem.makeDirectory(datasetDir, { recursive: true })
    yield* fileSystem.makeDirectory(workDir, { recursive: true })
    yield* fileSystem.makeDirectory(cacheDir, { recursive: true })

    const packs = yield* writeRules(world, fileSystem, paths, base)

    yield* writeDatasetFilesOf({ world, datasetDir })
    yield* writeDimensions(fileSystem, paths, datasetDir, world)
    yield* writeCandidateTasksOf({ world, workDir })
    yield* writeSelectionTracesOf({ world, workDir })
    yield* provider.answerBy(yield* scriptedAnswersOf(world))

    return {
      base,
      datasetDir,
      workDir,
      cacheDir,
      reportPath,
      packs,
      packDirs: packs.map((pack) => pack.dir),
      provider,
      request: {
        packDirs: packs.map((pack) => pack.dir),
        datasetDir,
        reportPath,
        selectorModel: materializedSelectorModel,
        provider: materializedProvider,
        seed: materializedSeed,
        iterations: materializedIterations,
        confidence: materializedConfidence,
        evidenceFloor: new PackEval.EvidenceFloor({
          positives: defaultEvidenceFloor.positives,
          negatives: defaultEvidenceFloor.negatives,
        }),
        judgeModel: materializedJudgeModel,
        judgeMinimum: materializedJudgeMinimum,
      } satisfies PackEval.EvaluatePacks.EvaluatePacksRequest,
    } satisfies MaterializedWorld
  })
