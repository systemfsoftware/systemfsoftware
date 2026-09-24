import { PackEval } from '@systemfsoftware/pack-eval'
import { Effect, Schema } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import * as Path from 'effect/Path'
import {
  type LoopbackReply,
  OpenRouterLoopback,
  type OpenRouterLoopbackShape,
  type QuestionKey,
  type ScriptedAnswer,
} from './openrouter-loopback.fixture.js'
import {
  type World,
  type WorldJudgeReply,
  type WorldProviderRefusal,
  type WorldRuleFile,
  type WorldSelectorReply,
} from './pack-eval-world.fixture.js'

export const materializedSelectorModel = 'acme/planner-large'
export const materializedJudgeModel = 'acme/judge-large'
export const materializedJudgeMinimum = 0.8
export const materializedProvider = 'openrouter'
export const materializedSeed = 7
export const materializedIterations = 200
export const materializedConfidence = 0.95

export interface MaterializedPack {
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

const completionOf = (content: string, servedModel: string): Schema.Json => ({
  id: 'pack-eval-disk-loopback',
  object: 'chat.completion',
  created: 1_760_000_000,
  model: servedModel,
  system_fingerprint: null,
  choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content } }],
})

const refusalReplyOf = (refusal: WorldProviderRefusal): LoopbackReply => ({
  status: refusal.status,
  body: { error: refusal.message },
})

const loadedStemsJson = Schema.fromJsonString(PackEval.LoadedStems)
const judgeReplyJson = Schema.fromJsonString(PackEval.JudgeReply)

const ruleTextOf = (rule: WorldRuleFile): string =>
  rule.malformed === true
    ? 'not frontmatter at all\n'
    : [
      '---',
      `title: ${rule.title}`,
      `applies_when: [${rule.appliesWhen.join(', ')}]`,
      `tags: [${rule.tags.join(', ')}]`,
      '---',
      '',
      rule.body,
      '',
    ].join('\n')

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
      reply: { status: 200, body: completionOf(content, reply.servedModel) },
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
      reply: { status: 200, body: completionOf(content, reply.servedModel) },
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

const writeInstruction = (paths: Path.Path, datasetDir: string, world: World) => {
  const instruction = world.instruction
  if (instruction === undefined) return Effect.void
  return PackEval.DatasetFiles.writeJson(
    paths.join(datasetDir, 'selector-instruction.json'),
    PackEval.SelectorInstruction,
    new PackEval.SelectorInstruction({
      text: instruction.text,
      provenance: new PackEval.SelectorProvenance({
        consumer: instruction.consumer,
        pluginVersion: instruction.pluginVersion,
        sourcePath: instruction.sourcePath,
      }),
    }),
  )
}

const writeJudgePrompt = (paths: Path.Path, datasetDir: string, world: World) => {
  const prompt = world.judgePrompt
  if (prompt === undefined) return Effect.void
  return PackEval.DatasetFiles.writeJson(
    paths.join(datasetDir, 'judge-prompt.json'),
    PackEval.JudgePrompt,
    new PackEval.JudgePrompt({
      criterion: prompt.criterion,
      passDefinition: prompt.passDefinition,
      failDefinition: prompt.failDefinition,
      fewShotPairIds: prompt.fewShotPairIds,
    }),
  )
}

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

const writeCandidates = (paths: Path.Path, workDir: string, world: World) => {
  if (world.candidates.length === 0) return Effect.void
  return PackEval.DatasetFiles.writeJson(
    paths.join(workDir, 'candidates.json'),
    PackEval.CandidateTasks,
    new PackEval.CandidateTasks({
      version: 1,
      candidates: world.candidates.map((candidate) =>
        new PackEval.CandidateTask({
          id: candidate.id,
          text: candidate.text,
          dimensions: candidate.dimensions,
        })
      ),
    }),
  )
}

const writeTraces = (paths: Path.Path, workDir: string, world: World) =>
  Effect.forEach(
    world.traces,
    (trace) =>
      PackEval.DatasetFiles.writeJson(
        paths.join(workDir, PackEval.DatasetFiles.traceRelativePathOf(trace.packId, trace.taskId)),
        PackEval.SelectionTrace,
        new PackEval.SelectionTrace({
          taskId: trace.taskId,
          packId: trace.packId,
          loadedStems: trace.loadedStems,
          requestedModel: trace.requestedModel,
          servedModel: trace.servedModel,
          instructionDigest: trace.instructionDigest,
          rawResponse: trace.rawResponse,
        }),
      ),
    { discard: true },
  )

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

    yield* writeInstruction(paths, datasetDir, world)
    yield* PackEval.DatasetFiles.writeJson(
      paths.join(datasetDir, 'tasks.json'),
      PackEval.TaskSet,
      new PackEval.TaskSet({
        version: 1,
        tasks: world.tasks.map((task) =>
          new PackEval.Task({
            id: task.id,
            text: task.text,
            split: task.split,
            dimensions: task.dimensions,
          })
        ),
      }),
    )
    yield* PackEval.DatasetFiles.writeJson(
      paths.join(datasetDir, 'routing-labels.json'),
      PackEval.RoutingLabels,
      new PackEval.RoutingLabels({
        version: 1,
        entries: world.routingLabels.map((entry) =>
          new PackEval.RoutingLabelEntry({
            taskId: entry.taskId,
            packId: entry.packId,
            governing: entry.governing,
            deferred: entry.deferred,
          })
        ),
      }),
    )
    yield* PackEval.DatasetFiles.writeJson(
      paths.join(datasetDir, 'pair-labels.json'),
      PackEval.PairLabels,
      new PackEval.PairLabels({
        version: 1,
        entries: world.pairLabels.map((label) =>
          new PackEval.PairLabel({
            id: label.id,
            taskId: label.taskId,
            packId: label.packId,
            ruleA: label.ruleA,
            ruleB: label.ruleB,
            split: label.split,
            verdict: label.verdict,
            origin: label.origin,
            notes: label.notes,
            ...(label.plantedBody === undefined ? {} : { plantedBody: label.plantedBody }),
          })
        ),
      }),
    )
    yield* writeJudgePrompt(paths, datasetDir, world)
    yield* writeDimensions(fileSystem, paths, datasetDir, world)
    yield* writeCandidates(paths, workDir, world)
    yield* writeTraces(paths, workDir, world)
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
        evidenceFloor: new PackEval.EvidenceFloor({ positives: 1, negatives: 1 }),
        judgeModel: materializedJudgeModel,
        judgeMinimum: materializedJudgeMinimum,
      } satisfies PackEval.EvaluatePacks.EvaluatePacksRequest,
    } satisfies MaterializedWorld
  })
