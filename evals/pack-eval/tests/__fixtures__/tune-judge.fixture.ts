import { OpenRouterClient, OpenRouterLanguageModel } from '@effect/ai-openrouter'
import { PackEval } from '@systemfsoftware/pack-eval'
import { Console, Effect, Layer, Redacted, Schema } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import * as Path from 'effect/Path'
import { type RuleSource, ruleTextOf } from './discovery-dataset.fixture.js'
import { type LoopbackReply, OpenRouterLoopback, type OpenRouterLoopbackShape } from './openrouter-loopback.fixture.js'

export const askedJudgeModel = 'acme/judge-large'
export const servedJudgeModel = 'acme/judge-large@acme'
export const tuneJudgePackId = 'greenhouse'

export const tuneJudgeRules: ReadonlyArray<RuleSource> = [
  {
    stem: 'hourly-venting',
    title: 'Vent the ripening room hourly',
    appliesWhen: ['cooling the ripening room'],
    tags: ['air'],
    body: 'Open the vents for one hour in every three.',
  },
  {
    stem: 'sealed-ripening',
    title: 'Seal the room while fruit ripens',
    appliesWhen: ['holding fruit in the room'],
    tags: ['air'],
    body: 'Keep every vent sealed while the room holds fruit.',
  },
]

export const plantedBody = 'Seal every vent and hold it open while the room holds fruit.'

export const trainCritiqueObserved =
  'The hourly vents and the sealed room cannot both hold, so no single change satisfies both rules.'

export const trainCritiquePlanted =
  'Planted: the sealed order and the hourly order contradict each other on the same vents.'

export const tuneJudgeTasks = new PackEval.TaskSet({
  version: 1,
  tasks: [
    new PackEval.Task({
      id: 'task-train-venting',
      text: 'TRAIN task: cool the ripening room before the weekend',
      split: 'dev',
      dimensions: {},
    }),
    new PackEval.Task({
      id: 'task-dev-trellis',
      text: 'DEV-A task: tie the tomato shoots to the trellis',
      split: 'dev',
      dimensions: {},
    }),
    new PackEval.Task({
      id: 'task-dev-harvest',
      text: 'DEV-B task: harvest the ripe tomatoes',
      split: 'dev',
      dimensions: {},
    }),
    new PackEval.Task({
      id: 'task-dev-mulch',
      text: 'DEV-C task: mulch the raised bed before noon',
      split: 'dev',
      dimensions: {},
    }),
    new PackEval.Task({
      id: 'task-dev-compost',
      text: 'DEV-D task: turn the compost heap at dusk',
      split: 'dev',
      dimensions: {},
    }),
    new PackEval.Task({
      id: 'task-test-vent',
      text: 'TEST task: open the east vent after the morning walk',
      split: 'test',
      dimensions: {},
    }),
  ],
})

export const tuneJudgePrompt = new PackEval.JudgePrompt({
  criterion: 'On this task, can one change satisfy both rules?',
  passDefinition: 'Pass: one change can satisfy both rules at once.',
  failDefinition: 'Fail: no single change satisfies both rules together.',
  fewShotPairIds: ['pair-train-vent', 'pair-train-planted'],
})

const pairOf = (
  id: string,
  taskId: string,
  split: 'train' | 'dev' | 'test',
  verdict: 'Pass' | 'Fail',
  origin: 'observed' | 'planted',
  notes: string,
  planted: boolean,
): PackEval.PairLabel =>
  new PackEval.PairLabel({
    id,
    taskId,
    packId: tuneJudgePackId,
    ruleA: 'hourly-venting',
    ruleB: 'sealed-ripening',
    split,
    verdict,
    origin,
    notes,
    ...(planted ? { plantedBody } : {}),
  })

const trainPairs: ReadonlyArray<PackEval.PairLabel> = [
  pairOf('pair-train-vent', 'task-train-venting', 'train', 'Fail', 'observed', trainCritiqueObserved, false),
  pairOf('pair-train-planted', 'task-train-venting', 'train', 'Fail', 'planted', trainCritiquePlanted, true),
]

const testPair: PackEval.PairLabel = pairOf(
  'pair-test-vent',
  'task-test-vent',
  'test',
  'Fail',
  'observed',
  '',
  false,
)

export const filterPairs: ReadonlyArray<PackEval.PairLabel> = [
  ...trainPairs,
  pairOf('pair-dev-trellis', 'task-dev-trellis', 'dev', 'Pass', 'observed', '', false),
  pairOf('pair-dev-harvest', 'task-dev-harvest', 'dev', 'Pass', 'observed', '', false),
  testPair,
]

export const ratesPairs: ReadonlyArray<PackEval.PairLabel> = [
  ...trainPairs,
  pairOf('pair-dev-trellis', 'task-dev-trellis', 'dev', 'Pass', 'observed', '', false),
  pairOf('pair-dev-harvest', 'task-dev-harvest', 'dev', 'Fail', 'observed', '', false),
  pairOf('pair-dev-mulch', 'task-dev-mulch', 'dev', 'Fail', 'observed', '', false),
  pairOf('pair-dev-compost', 'task-dev-compost', 'dev', 'Pass', 'observed', '', false),
]

const verdictTextOf = Schema.encodeEffect(Schema.fromJsonString(PackEval.JudgeReply))

export const verdictReply = (options: {
  readonly verdict: PackEval.JudgeVerdict
  readonly critique: string
}): Effect.Effect<LoopbackReply, Schema.SchemaError> =>
  Effect.map(verdictTextOf({ critique: options.critique, verdict: options.verdict }), (content) => ({
    status: 200,
    body: {
      id: 'tune-judge-loopback',
      object: 'chat.completion',
      created: 1_760_000_000,
      model: servedJudgeModel,
      system_fingerprint: null,
      choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content } }],
    },
  }))
export const textReply = (content: string): Effect.Effect<LoopbackReply, Schema.SchemaError> =>
  Effect.succeed({
    status: 200,
    body: {
      id: 'tune-judge-loopback',
      object: 'chat.completion',
      created: 1_760_000_000,
      model: servedJudgeModel,
      system_fingerprint: null,
      choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content } }],
    },
  })

export interface TuneJudgeScript {
  readonly pairs: ReadonlyArray<PackEval.PairLabel>
  readonly replies: ReadonlyArray<Effect.Effect<LoopbackReply, Schema.SchemaError>>
}

export interface TuneJudgeWorld {
  readonly provider: OpenRouterLoopbackShape
  readonly packDir: string
  readonly datasetDir: string
  readonly cacheDir: string
  readonly lines: Array<string>
}

export const tuneJudgeWorld = (script: TuneJudgeScript) =>
  Effect.gen(function*() {
    const provider = yield* OpenRouterLoopback
    const fileSystem = yield* FileSystem.FileSystem
    const paths = yield* Path.Path
    yield* provider.answerWith(yield* Effect.all(script.replies))
    const base = yield* fileSystem.makeTempDirectoryScoped()
    const datasetDir = paths.join(base, 'dataset')
    const packDir = paths.join(base, 'packs', tuneJudgePackId)
    const cacheDir = yield* fileSystem.makeTempDirectoryScoped()
    yield* fileSystem.makeDirectory(packDir, { recursive: true })
    yield* fileSystem.makeDirectory(datasetDir, { recursive: true })
    yield* Effect.forEach(
      tuneJudgeRules,
      (rule) => fileSystem.writeFileString(paths.join(packDir, `${rule.stem}.md`), ruleTextOf(rule)),
      { discard: true },
    )
    yield* PackEval.DatasetFiles.writeJson(paths.join(datasetDir, 'tasks.json'), PackEval.TaskSet, tuneJudgeTasks)
    yield* PackEval.DatasetFiles.writeJson(
      paths.join(datasetDir, 'judge-prompt.json'),
      PackEval.JudgePrompt,
      tuneJudgePrompt,
    )
    yield* PackEval.DatasetFiles.writeJson(
      paths.join(datasetDir, 'pair-labels.json'),
      PackEval.PairLabels,
      new PackEval.PairLabels({ version: 1, entries: script.pairs }),
    )
    return { provider, packDir, datasetDir, cacheDir, lines: [] } satisfies TuneJudgeWorld
  })

const recordingConsoleOf = (lines: Array<string>): Console.Console => ({
  assert: () => undefined,
  clear: () => undefined,
  count: () => undefined,
  countReset: () => undefined,
  debug: () => undefined,
  dir: () => undefined,
  dirxml: () => undefined,
  error(...args: ReadonlyArray<string>) {
    lines.push(args.join(' '))
  },
  group: () => undefined,
  groupCollapsed: () => undefined,
  groupEnd: () => undefined,
  info: () => undefined,
  log(...args: ReadonlyArray<string>) {
    lines.push(args.join(' '))
  },
  table: () => undefined,
  time: () => undefined,
  timeEnd: () => undefined,
  timeLog: () => undefined,
  trace: () => undefined,
  warn: () => undefined,
})

export const tuneJudgeStack = (world: TuneJudgeWorld) =>
  Layer.provideMerge(
    Layer.provideMerge(
      Layer.provideMerge(
        PackEval.OpenRouterContradictionJudge.layer({ model: askedJudgeModel }),
        PackEval.FileAnswerCache.layer({ cacheDir: world.cacheDir }),
      ),
      OpenRouterLanguageModel.layer({ model: askedJudgeModel }),
    ),
    Layer.merge(
      OpenRouterClient.layer({ apiUrl: world.provider.apiUrl, apiKey: Redacted.make('sk-loopback') }),
      Layer.succeed(Console.Console, recordingConsoleOf(world.lines)),
    ),
  )
