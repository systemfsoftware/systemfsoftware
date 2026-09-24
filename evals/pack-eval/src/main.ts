import { OpenRouterClient, OpenRouterLanguageModel } from '@effect/ai-openrouter'
import { NodeClusterHttp, NodeHttpClient, NodeRuntime, NodeServices } from '@effect/platform-node'
import { Config, Console, Effect, Layer, Option, Runtime } from 'effect'
import type * as Crypto from 'effect/Crypto'
import type * as FileSystem from 'effect/FileSystem'
import type * as Path from 'effect/Path'
import { CliError, Command, Flag } from 'effect/unstable/cli'
import * as RunnerAddress from 'effect/unstable/cluster/RunnerAddress'
import * as ShardingConfig from 'effect/unstable/cluster/ShardingConfig'
import { run as fingerprintRun } from './compute-fingerprint.cell.js'
import * as ReviewServer from './drivers/review-server.js'
import { EvidenceFloor } from './eval-report.schema.js'
import { run as evaluateRun } from './evaluate-packs.cell.js'
import { generateTasks } from './generate-tasks.cell.js'
import {
  AnswerCacheFailure,
  ContradictionJudge,
  FileAnswerCache,
  OpenRouterContradictionJudge,
  OpenRouterRuleSelector,
  OpenRouterTaskGenerator,
  RuleSelector,
  TaskGenerator,
} from './PackEval/mod.js'
import { traceSelection } from './trace-selection.cell.js'
import { run as tuneJudgeRun } from './tune-judge.cell.js'

const VERSION = '0.0.0'

const DESCRIPTION = "Measures how well an agent's rule selection routes compound pack rules."

const DEFAULT_CONFIDENCE = 0.95

const DEFAULT_FLOOR = new EvidenceFloor({ positives: 3, negatives: 3 })

const DEFAULT_DATASET = 'evals/compound-packs'

const DEFAULT_JUDGE_MINIMUM = 0.8

interface ExitFailure {
  readonly [Runtime.errorExitCode]: number
  readonly [Runtime.errorReported]: boolean
}

const exitFailureOf = (code: number): ExitFailure => ({
  [Runtime.errorExitCode]: code,
  [Runtime.errorReported]: false,
})

/**
 * A command line the parser rejects exits 2, the refusal code. The parser has already printed why. Left alone it
 * would exit 1, which this tool reserves for a witnessed contradiction.
 */
const refusedCommandLine: ExitFailure = {
  [Runtime.errorExitCode]: 2,
  [Runtime.errorReported]: true,
}

const reportExit = (outcome: number): Effect.Effect<void, ExitFailure> =>
  outcome === 0 ? Effect.void : Effect.fail(exitFailureOf(outcome))

const refuseWithExitTwo = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.tapError((error) => Console.log(error)),
    Effect.mapError(() => exitFailureOf(2)),
  )

const repeatablePack = Flag.map(Flag.String('pack').pipe(Flag.atLeast(1)), (packs) => packs.flat())

const evaluateFlags = {
  pack: repeatablePack,
  dataset: Flag.String('dataset'),
  workDir: Flag.String('work-dir').pipe(Flag.withDefault('.pack-eval')),
  report: Flag.String('report'),
  selectorModel: Flag.String('selector-model'),
  provider: Flag.Literals('provider', ['openrouter'] as const).pipe(Flag.withDefault('openrouter')),
  seed: Flag.Int('seed').pipe(Flag.withDefault(0)),
  iterations: Flag.Int('iterations').pipe(Flag.withDefault(1000)),
  judgeModel: Flag.optional(Flag.String('judge-model')),
  judgeMinimum: Flag.Finite('judge-minimum').pipe(Flag.withDefault(DEFAULT_JUDGE_MINIMUM)),
} as const

const evaluate = Command.make('evaluate', evaluateFlags, (config) =>
  Effect.flatMap(
    refuseWithExitTwo(evaluateRun.run({
      packDirs: config.pack,
      datasetDir: config.dataset,
      reportPath: config.report,
      selectorModel: config.selectorModel,
      provider: config.provider,
      seed: config.seed,
      iterations: config.iterations,
      confidence: DEFAULT_CONFIDENCE,
      evidenceFloor: DEFAULT_FLOOR,
      judgeModel: Option.getOrUndefined(config.judgeModel),
      judgeMinimum: config.judgeMinimum,
    })),
    (outcome) => reportExit(outcome),
  )).pipe(
    Command.withDescription('Replay the selection step over the labelled task set and score routing.'),
  )

const fingerprintFlags = {
  pack: repeatablePack,
  dataset: Flag.String('dataset'),
  selectorModel: Flag.String('selector-model'),
  provider: Flag.Literals('provider', ['openrouter'] as const).pipe(Flag.withDefault('openrouter')),
  seed: Flag.Int('seed').pipe(Flag.withDefault(0)),
  iterations: Flag.Int('iterations').pipe(Flag.withDefault(1000)),
  codeRoot: Flag.String('code-root'),
  lockfile: Flag.String('lockfile'),
  judgeModel: Flag.optional(Flag.String('judge-model')),
  judgeMinimum: Flag.Finite('judge-minimum').pipe(Flag.withDefault(DEFAULT_JUDGE_MINIMUM)),
} as const

const fingerprint = Command.make('fingerprint', fingerprintFlags, (config) =>
  Effect.flatMap(
    refuseWithExitTwo(fingerprintRun.run({
      packDirs: config.pack,
      datasetDir: config.dataset,
      codeRoot: config.codeRoot,
      lockfilePath: config.lockfile,
      selectorModel: config.selectorModel,
      judgeModel: Option.getOrUndefined(config.judgeModel),
      judgeMinimum: config.judgeMinimum,
      seed: config.seed,
      iterations: config.iterations,
      confidence: DEFAULT_CONFIDENCE,
      evidenceFloor: DEFAULT_FLOOR,
    })),
    (outcome) => reportExit(outcome),
  )).pipe(
    Command.withDescription('Print the sha256 digest of the evaluation inputs.'),
  )

const generateFlags = {
  dataset: Flag.String('dataset'),
  workDir: Flag.String('work-dir').pipe(Flag.withDefault('.pack-eval')),
  generatorModel: Flag.String('generator-model'),
} as const

const generate = Command.make('generate', generateFlags, (config) =>
  Effect.flatMap(
    refuseWithExitTwo(generateTasks.run({ datasetDir: config.dataset, workDir: config.workDir })),
    (result) =>
      Console.log(
        `accepted ${result.admittedIds.length} candidates; ${result.candidateCount} total in ${result.candidatesPath}`,
      ),
  )).pipe(
    Command.withDescription('Propose task tuples with the generator model and stage candidates for review.'),
  )

const traceFlags = {
  pack: repeatablePack,
  dataset: Flag.String('dataset'),
  workDir: Flag.String('work-dir').pipe(Flag.withDefault('.pack-eval')),
  selectorModel: Flag.String('selector-model'),
} as const

const trace = Command.make('trace', traceFlags, (config) =>
  Effect.flatMap(
    refuseWithExitTwo(traceSelection.run({
      datasetDir: config.dataset,
      workDir: config.workDir,
      packDirs: config.pack,
    })),
    (result) => Console.log(`wrote ${result.tracePaths.length} traces: ${result.tracePaths.join(', ')}`),
  )).pipe(
    Command.withDescription('Replay the selection step over the task set and write one trace per task.'),
  )

const reviewFlags = {
  pack: repeatablePack,
  dataset: Flag.String('dataset'),
  workDir: Flag.String('work-dir').pipe(Flag.withDefault('.pack-eval')),
  port: Flag.Int('port').pipe(Flag.withDefault(4173)),
} as const

const review = Command.make(
  'review',
  reviewFlags,
  (config) =>
    Console.log(`serving the review page at http://127.0.0.1:${config.port}/`).pipe(
      Effect.andThen(Layer.launch(
        ReviewServer.layer({ datasetDir: config.dataset, workDir: config.workDir, packDirs: config.pack }),
      )),
      refuseWithExitTwo,
    ),
).pipe(
  Command.withDescription('Serve the labelling review page over the dataset and work directories.'),
)

const tuneJudgeFlags = {
  pack: repeatablePack,
  dataset: Flag.String('dataset').pipe(Flag.withDefault(DEFAULT_DATASET)),
  workDir: Flag.String('work-dir').pipe(Flag.withDefault('.pack-eval')),
  judgeModel: Flag.String('judge-model'),
} as const

const tuneJudge = Command.make('tune-judge', tuneJudgeFlags, (config) =>
  Effect.as(
    refuseWithExitTwo(tuneJudgeRun.run({ packDirs: config.pack, datasetDir: config.dataset })),
    undefined,
  )).pipe(
    Command.withDescription('Judge the dev pair labels and print TPR, TNR, and every disagreement.'),
  )

const apiKey = Config.map(Config.option(Config.Redacted('OPENROUTER_API_KEY')), Option.getOrUndefined)

const nodeLayer = Layer.mergeAll(NodeServices.layer, NodeHttpClient.layerNodeHttp)

const baseLayer = Layer.provideMerge(OpenRouterClient.layerConfig({ apiKey }), nodeLayer)

const languageStackOf = (model: string, workDir: string) =>
  Layer.merge(OpenRouterLanguageModel.layer({ model }), FileAnswerCache.layer({ cacheDir: `${workDir}/cache` }))

const selectorStackOf = (
  model: string,
  workDir: string,
): Layer.Layer<
  RuleSelector,
  AnswerCacheFailure,
  OpenRouterClient.OpenRouterClient | Crypto.Crypto | FileSystem.FileSystem | Path.Path
> => Layer.provideMerge(OpenRouterRuleSelector.layer({ model }), languageStackOf(model, workDir))

const judgeStackOf = (
  model: string,
  workDir: string,
): Layer.Layer<
  ContradictionJudge,
  AnswerCacheFailure,
  OpenRouterClient.OpenRouterClient | Crypto.Crypto | FileSystem.FileSystem | Path.Path
> => Layer.provideMerge(OpenRouterContradictionJudge.layer({ model }), languageStackOf(model, workDir))

const generatorStackOf = (
  model: string,
  workDir: string,
): Layer.Layer<
  TaskGenerator,
  AnswerCacheFailure,
  OpenRouterClient.OpenRouterClient | Crypto.Crypto | FileSystem.FileSystem | Path.Path
> => Layer.provideMerge(OpenRouterTaskGenerator.layer({ model }), languageStackOf(model, workDir))

const reviewStackOf = (port: number) =>
  Layer.provideMerge(
    NodeClusterHttp.layerHttpServer,
    ShardingConfig.layer({ runnerListenAddress: Option.some(RunnerAddress.make('127.0.0.1', port)) }),
  )

const evaluationStacksOf = (
  selectorModel: string,
  judgeModel: Option.Option<string>,
  workDir: string,
):
  | Layer.Layer<
    RuleSelector,
    AnswerCacheFailure,
    OpenRouterClient.OpenRouterClient | Crypto.Crypto | FileSystem.FileSystem | Path.Path
  >
  | Layer.Layer<
    RuleSelector | ContradictionJudge,
    AnswerCacheFailure,
    OpenRouterClient.OpenRouterClient | Crypto.Crypto | FileSystem.FileSystem | Path.Path
  > =>
  Option.match(
    judgeModel,
    {
      // Without a judge model the evaluate run refuses before any judge is asked,
      // so this branch supplies only the selector it uses.
      onNone: () => selectorStackOf(selectorModel, workDir),
      onSome: (model) => Layer.merge(selectorStackOf(selectorModel, workDir), judgeStackOf(model, workDir)),
    },
  )

const root = Command.make('pack-eval').pipe(
  Command.withDescription(DESCRIPTION),
  Command.withSubcommands([
    Command.provide(
      evaluate,
      (input) => evaluationStacksOf(input.selectorModel, input.judgeModel, input.workDir),
    ),
    Command.provide(trace, (input) => selectorStackOf(input.selectorModel, input.workDir)),
    Command.provide(generate, (input) => generatorStackOf(input.generatorModel, input.workDir)),
    Command.provide(review, (input) => reviewStackOf(input.port)),
    Command.provide(tuneJudge, (input) => judgeStackOf(input.judgeModel, input.workDir)),
    fingerprint,
  ]),
)

NodeRuntime.runMain(
  Command.run(root, { version: VERSION }).pipe(
    Effect.catchIf(CliError.isCliError, () => Effect.fail(refusedCommandLine)),
    Effect.provide(baseLayer),
  ),
)
