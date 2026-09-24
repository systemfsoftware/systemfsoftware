import { Console, Effect, Layer, Runtime } from 'effect'
import { Command, Flag } from 'effect/unstable/cli'
import { run as fingerprintRun } from '../compute-fingerprint.cell.js'
import { EvidenceFloor } from '../eval-report.schema.js'
import { run as evaluateRun } from '../evaluate-packs.cell.js'
import { generateTasks } from '../generate-tasks.cell.js'
import { traceSelection } from '../trace-selection.cell.js'
import * as ReviewServer from './review-server.js'

export const VERSION = '0.0.0'

export const DESCRIPTION = "Measures how well an agent's rule selection routes compound pack rules."

export const DEFAULT_CONFIDENCE = 0.95

export const DEFAULT_FLOOR = new EvidenceFloor({ positives: 3, negatives: 3 })

interface ExitFailure {
  readonly [Runtime.errorExitCode]: number
  readonly [Runtime.errorReported]: boolean
}

const exitFailureOf = (code: number): ExitFailure => ({
  [Runtime.errorExitCode]: code,
  [Runtime.errorReported]: false,
})

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
} as const

export const evaluate = Command.make('evaluate', evaluateFlags, (config) =>
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
} as const

export const fingerprint = Command.make('fingerprint', fingerprintFlags, (config) =>
  Effect.flatMap(
    refuseWithExitTwo(fingerprintRun.run({
      packDirs: config.pack,
      datasetDir: config.dataset,
      codeRoot: config.codeRoot,
      lockfilePath: config.lockfile,
      selectorModel: config.selectorModel,
      judgeModel: undefined,
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

export const generate = Command.make('generate', generateFlags, (config) =>
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

export const trace = Command.make('trace', traceFlags, (config) =>
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
export const review = Command.make(
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
export const cli = Command.make('pack-eval').pipe(
  Command.withDescription(DESCRIPTION),
  Command.withSubcommands([evaluate, fingerprint, generate, trace, review]),
)
