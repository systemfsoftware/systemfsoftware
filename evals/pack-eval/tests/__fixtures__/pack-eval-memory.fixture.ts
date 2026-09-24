import { PackEval } from '@systemfsoftware/pack-eval'
import { Console, Effect, HashMap, Layer, Option, Ref, Result, Schema } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import { dual } from 'effect/Function'
import * as Path from 'effect/Path'
import { writeDatasetFilesOf } from './pack-eval-dataset.fixture.js'
import { ruleTextOf, type World, type WorldJudgeReply, type WorldSelectorReply } from './pack-eval-world.fixture.js'
import { recordingConsoleOf } from './recording-console.fixture.js'

/**
 * Runs the real `EvaluatePacks` cell for a world with no disk and no network.
 *
 * The cell keeps every evaluate decision (scoring, gating, verdicts, outcome)
 * inside itself, and the make-body-purity law forbids one workflow calling
 * another, so the decision cannot be pulled into a single pure workflow that a
 * generated world could call directly. Instead this interpreter runs the cell
 * in-process with doubles at its ports only: an in-memory `FileSystem` holding
 * the world's files, and world-scripted `RuleSelector` and `ContradictionJudge`
 * services that answer from the world and record every question asked. Nothing
 * touches a real directory or a network, so generated worlds never reach I/O.
 *
 * R9/R20 are observed from the cell: the exit code and the report written into
 * the in-memory filesystem, plus the selector and judge questions the doubles
 * recorded and the card the run wrote to its recording console.
 */

export interface SelectorQuestion {
  readonly taskId: string
  readonly packId: string
}

export interface JudgeQuestion {
  readonly packId: string
  readonly taskId: string
  readonly ruleA: string
  readonly ruleB: string
}

export interface InMemoryRun {
  readonly exitCode: number | undefined
  readonly report: PackEval.EvalReport | undefined
  readonly refusal: PackEval.DatasetFileRefusal | undefined
  readonly selectorQuestions: ReadonlyArray<SelectorQuestion>
  readonly judgeQuestions: ReadonlyArray<JudgeQuestion>
  readonly card: string
}

interface InMemoryOptions {
  readonly seed?: number | undefined
  readonly iterations?: number | undefined
  readonly confidence?: number | undefined
  readonly evidenceFloor?: PackEval.EvidenceFloor | undefined
  readonly judgeModel?: string | undefined
  readonly judgeMinimum?: number | undefined
}

const defaultSeed = 7
const defaultIterations = 50
const defaultConfidence = 0.95
const defaultJudgeModel = 'acme/judge-large'
const defaultJudgeMinimum = 0.8

const baseDir = '/world'

interface WorldLayout {
  readonly base: string
  readonly datasetDir: string
  readonly reportPath: string
  readonly packDirs: ReadonlyArray<string>
}

const layoutOf = (world: World): WorldLayout => {
  const packDirs = world.packs.map((pack) => `${baseDir}/packs/${pack.id}`)
  return {
    base: baseDir,
    datasetDir: `${baseDir}/dataset`,
    reportPath: `${baseDir}/report.json`,
    packDirs,
  }
}

const selectorReplyOf = (
  world: World,
  taskId: string,
  packId: string,
): WorldSelectorReply | undefined =>
  world.answers.selector.find((entry) => entry.taskId === taskId && entry.packId === packId)

const judgeReplyOf = (
  world: World,
  packId: string,
  taskId: string,
  ruleA: string,
  ruleB: string,
): WorldJudgeReply | undefined =>
  world.answers.judge.find((entry) =>
    entry.question.packId === packId &&
    entry.question.taskId === taskId &&
    entry.question.ruleA === ruleA &&
    entry.question.ruleB === ruleB
  )

const writeWorld = (world: World, layout: WorldLayout) =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem
    const paths = yield* Path.Path

    yield* Effect.forEach(
      world.packs,
      (pack, packIndex) =>
        Effect.forEach(
          pack.rules,
          (rule) => {
            const dir = layout.packDirs[packIndex] ?? `${baseDir}/packs/${pack.id}`
            return fileSystem.writeFileString(paths.join(dir, `${rule.stem}.md`), ruleTextOf(rule))
          },
          { discard: true },
        ),
      { discard: true },
    )

    yield* writeDatasetFilesOf({ world, datasetDir: layout.datasetDir })
  })

const loadedStemsJson = Schema.fromJsonString(PackEval.LoadedStems)

const selectorShape = (
  world: World,
  questions: Ref.Ref<ReadonlyArray<SelectorQuestion>>,
): PackEval.RuleSelectorShape => ({
  select: (request) =>
    Effect.gen(function*() {
      const reply = selectorReplyOf(world, request.task.id, request.pack.id)
      if (reply === undefined) {
        return yield* new PackEval.ProviderFailure({
          role: 'selector',
          model: request.instruction.provenance.consumer,
          message: `no scripted selector answer for ${request.task.id}/${request.pack.id}`,
        })
      }
      yield* Ref.update(questions, (all) => [...all, { taskId: request.task.id, packId: request.pack.id }])
      if (reply.kind === 'refused') {
        return yield* new PackEval.ProviderFailure({
          role: 'selector',
          model: request.instruction.provenance.consumer,
          message: reply.refusal.message,
        })
      }
      const rawResponse = yield* Schema.encodeEffect(loadedStemsJson)({ loaded: reply.stems }).pipe(Effect.orDie)
      return new PackEval.SelectionTrace({
        taskId: request.task.id,
        packId: request.pack.id,
        loadedStems: reply.stems,
        requestedModel: reply.servedModel,
        servedModel: reply.servedModel,
        instructionDigest: 'in-memory',
        rawResponse,
      })
    }),
})

const judgeShape = (
  world: World,
  questions: Ref.Ref<ReadonlyArray<JudgeQuestion>>,
): PackEval.ContradictionJudgeShape => ({
  judge: (request) =>
    Effect.gen(function*() {
      const reply = judgeReplyOf(world, request.packId, request.taskId, request.ruleA.stem, request.ruleB.stem)
      if (reply === undefined) {
        return yield* new PackEval.JudgeFailure({
          role: 'judge',
          model: request.prompt.criterion,
          message: `no scripted judge answer for ${request.taskId}`,
        })
      }
      yield* Ref.update(questions, (all) => [
        ...all,
        {
          packId: request.packId,
          taskId: request.taskId,
          ruleA: request.ruleA.stem,
          ruleB: request.ruleB.stem,
        },
      ])
      if (reply.kind === 'refused') {
        return yield* new PackEval.JudgeFailure({
          role: 'judge',
          model: request.prompt.criterion,
          message: reply.refusal.message,
        })
      }
      return new PackEval.JudgedPair({
        critique: reply.critique,
        verdict: reply.verdict,
        servedModel: reply.servedModel,
      })
    }),
})
const decodeReport = (text: string): PackEval.EvalReport | undefined =>
  Option.getOrUndefined(Schema.decodeOption(Schema.fromJsonString(PackEval.EvalReport))(text))

const requestOf = (
  layout: WorldLayout,
  options: InMemoryOptions,
): PackEval.EvaluatePacks.EvaluatePacksRequest => ({
  packDirs: layout.packDirs,
  datasetDir: layout.datasetDir,
  reportPath: layout.reportPath,
  selectorModel: 'acme/planner-large',
  provider: 'openrouter',
  seed: options.seed ?? defaultSeed,
  iterations: options.iterations ?? defaultIterations,
  confidence: options.confidence ?? defaultConfidence,
  evidenceFloor: options.evidenceFloor ?? new PackEval.EvidenceFloor({ positives: 3, negatives: 3 }),
  judgeModel: options.judgeModel ?? defaultJudgeModel,
  judgeMinimum: options.judgeMinimum ?? defaultJudgeMinimum,
})

const runInMemoryImpl = (world: World, options?: InMemoryOptions): Effect.Effect<InMemoryRun> =>
  Effect.gen(function*() {
    const resolved = options ?? {}
    const layout = layoutOf(world)
    const files = yield* Ref.make(HashMap.empty<string, string>())
    const directories = yield* Ref.make(
      HashMap.fromIterable(
        world.packs.map((pack, index): readonly [string, ReadonlyArray<string>] => [
          layout.packDirs[index] ?? `${baseDir}/packs/${pack.id}`,
          pack.rules.map((rule) => `${rule.stem}.md`).toSorted(),
        ]),
      ),
    )
    const fileSystem = FileSystem.layerNoop({
      exists: (path) =>
        Effect.zipWith(
          Ref.get(files),
          Ref.get(directories),
          (stored, listed) => HashMap.has(stored, path) || HashMap.has(listed, path),
        ),
      readFileString: (path) =>
        Effect.flatMap(Ref.get(files), (stored) =>
          Option.match(HashMap.get(stored, path), {
            onNone: () => Effect.die(new Error(`in-memory filesystem has no file at ${path}`)),
            onSome: Effect.succeed,
          })),
      readDirectory: (path) =>
        Effect.flatMap(Ref.get(directories), (listed) =>
          Option.match(HashMap.get(listed, path), {
            onNone: () => Effect.die(new Error(`in-memory filesystem has no directory at ${path}`)),
            onSome: (names) => Effect.succeed([...names]),
          })),
      writeFileString: (path, text) => Ref.update(files, (stored) => HashMap.set(stored, path, text)),
      makeDirectory: () => Effect.void,
    })

    const ioLayer = Layer.merge(fileSystem, Path.layer)
    const selectorQuestions = yield* Ref.make<ReadonlyArray<SelectorQuestion>>([])
    const judgeQuestions = yield* Ref.make<ReadonlyArray<JudgeQuestion>>([])
    const lines: Array<string> = []
    const serviceLayer = Layer.mergeAll(
      Layer.succeed(PackEval.RuleSelector, selectorShape(world, selectorQuestions)),
      Layer.succeed(PackEval.ContradictionJudge, judgeShape(world, judgeQuestions)),
      Layer.succeed(Console.Console, recordingConsoleOf(lines)),
    )
    const layer = Layer.mergeAll(ioLayer, serviceLayer)

    yield* Effect.provide(writeWorld(world, layout), ioLayer).pipe(Effect.orDie)

    const outcome = yield* Effect.result(
      Effect.provide(PackEval.EvaluatePacks.run.run(requestOf(layout, resolved)), layer),
    )
    const reportText = HashMap.get(yield* Ref.get(files), layout.reportPath)
    return {
      exitCode: Result.isSuccess(outcome) ? outcome.success : undefined,
      report: Option.isSome(reportText) ? decodeReport(reportText.value) : undefined,
      refusal: Result.isFailure(outcome) ? outcome.failure : undefined,
      selectorQuestions: yield* Ref.get(selectorQuestions),
      judgeQuestions: yield* Ref.get(judgeQuestions),
      card: lines.join('\n'),
    } satisfies InMemoryRun
  })

export const runInMemory: {
  (options?: InMemoryOptions): (world: World) => Effect.Effect<InMemoryRun>
  (world: World, options?: InMemoryOptions): Effect.Effect<InMemoryRun>
} = dual(2, runInMemoryImpl)
