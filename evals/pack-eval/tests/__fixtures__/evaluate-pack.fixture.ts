import { OpenRouterClient, OpenRouterLanguageModel } from '@effect/ai-openrouter'
import { PackEval } from '@systemfsoftware/pack-eval'
import { Effect, Layer, Redacted, Schema } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import * as Path from 'effect/Path'
import { type RuleSource, ruleTextOf, servedModel, stemsReply } from './discovery-dataset.fixture.js'
import { OpenRouterLoopback, type OpenRouterLoopbackShape } from './openrouter-loopback.fixture.js'

export { servedModel }

export const askedModel = 'acme/planner-large'

export const evaluatePackId = 'greenhouse'

const greenhouseRules: ReadonlyArray<RuleSource> = [
  {
    stem: 'watering-schedule',
    title: 'Water on a schedule',
    appliesWhen: ['touching the watering plan'],
    tags: ['water'],
    body: 'Water every second morning and write the amount in the log.',
  },
  {
    stem: 'prune-everything',
    title: 'Prune after every walk-through',
    appliesWhen: ['walking the rows for any reason'],
    tags: ['prune'],
    body: 'Cut back every shoot that crossed the wire.',
  },
  {
    stem: 'seed-labelling',
    title: 'Label every seed tray',
    appliesWhen: ['writing the seed order'],
    tags: ['seed'],
    body: 'Write the variety and the sowing date on every tray.',
  },
]

/** AE7: the pruning file kept its content but lost the stem the labels name. */
const renamedGreenhouseRules: ReadonlyArray<RuleSource> = greenhouseRules.map((rule) =>
  rule.stem === 'prune-everything' ? { ...rule, stem: 'prune-rotations' } : rule
)
const rulesOf = (renamed: boolean): ReadonlyArray<RuleSource> => (renamed ? renamedGreenhouseRules : greenhouseRules)

export const evaluationInstruction = new PackEval.SelectorInstruction({
  text: 'Load every rule whose applies_when matches the work the task describes.',
  provenance: new PackEval.SelectorProvenance({
    consumer: 'greenkeeper',
    pluginVersion: '1.0.0',
    sourcePath: 'references/agents/greenkeeper.md',
  }),
})

const taskTexts: Readonly<Record<string, string>> = {
  'task-trellis': 'Tie the tomato shoots to the trellis before the weekend',
  'task-typo': 'Fix a typo in the greenhouse README',
  'task-harvest': 'Harvest the ripe tomatoes before they split',
  'task-transplant': 'Transplant the seedlings into the raised bed',
  'task-vent': 'Open the east vent after the morning walk',
}

const taskOf = (id: string, split: 'dev' | 'test'): PackEval.Task =>
  new PackEval.Task({ id, text: taskTexts[id] ?? id, split, dimensions: {} })

export const evaluationTasks: ReadonlyArray<PackEval.Task> = [
  taskOf('task-trellis', 'dev'),
  taskOf('task-typo', 'dev'),
  taskOf('task-harvest', 'test'),
  taskOf('task-transplant', 'test'),
  taskOf('task-vent', 'test'),
]

const labelEntryOf = (taskId: string, governing: ReadonlyArray<string>): PackEval.RoutingLabelEntry =>
  new PackEval.RoutingLabelEntry({ taskId, packId: evaluatePackId, governing, deferred: ['seed-labelling'] })

export const evaluationRoutingLabels = new PackEval.RoutingLabels({
  version: 1,
  entries: [
    labelEntryOf('task-trellis', ['watering-schedule']),
    labelEntryOf('task-typo', []),
    labelEntryOf('task-harvest', ['watering-schedule']),
    labelEntryOf('task-transplant', ['prune-everything']),
    labelEntryOf('task-vent', ['prune-everything']),
  ],
})

/**
 * The scripted selector answers, in task order. Hand-written to match the
 * labels: the selector loads the watering rule where it belongs, leaks the
 * broad pruning rule onto every other row, and never names the rule nothing
 * governs.
 */
export const evaluationReplies = (
  provider: OpenRouterLoopbackShape,
): Effect.Effect<void, Schema.SchemaError> =>
  Effect.flatMap(
    Effect.all([
      stemsReply(['watering-schedule']),
      stemsReply(['prune-everything']),
      stemsReply(['watering-schedule', 'prune-everything']),
      stemsReply(['prune-everything']),
      stemsReply(['prune-everything']),
    ]),
    (replies) => provider.answerWith(replies),
  )

export interface EvaluateWorld {
  readonly provider: OpenRouterLoopbackShape
  readonly datasetDir: string
  readonly packDir: string
  readonly reportPath: string
  readonly cacheDir: string
}

export const evaluationStack = (
  world: EvaluateWorld,
) =>
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

export const evaluateWorld = (options?: {
  readonly renamedRule?: boolean
  readonly malformedRule?: boolean
}) =>
  Effect.gen(function*() {
    const provider = yield* OpenRouterLoopback
    const fileSystem = yield* FileSystem.FileSystem
    const paths = yield* Path.Path
    yield* evaluationReplies(provider)
    const base = yield* fileSystem.makeTempDirectoryScoped()
    const datasetDir = paths.join(base, 'dataset')
    const packDir = paths.join(base, 'packs', evaluatePackId)
    const reportPath = paths.join(base, 'report.json')
    const cacheDir = paths.join(base, 'cache')
    yield* fileSystem.makeDirectory(datasetDir, { recursive: true })
    yield* fileSystem.makeDirectory(packDir, { recursive: true })
    yield* PackEval.DatasetFiles.writeJson(
      paths.join(datasetDir, 'selector-instruction.json'),
      PackEval.SelectorInstruction,
      evaluationInstruction,
    )
    yield* PackEval.DatasetFiles.writeJson(
      paths.join(datasetDir, 'tasks.json'),
      PackEval.TaskSet,
      new PackEval.TaskSet({ version: 1, tasks: evaluationTasks }),
    )
    yield* PackEval.DatasetFiles.writeJson(
      paths.join(datasetDir, 'routing-labels.json'),
      PackEval.RoutingLabels,
      evaluationRoutingLabels,
    )
    if (options?.malformedRule === true) {
      yield* fileSystem.writeFileString(paths.join(packDir, 'prune-everything.md'), 'not frontmatter at all\n')
      for (const rule of greenhouseRules.filter((rule) => rule.stem !== 'prune-everything')) {
        yield* fileSystem.writeFileString(paths.join(packDir, `${rule.stem}.md`), ruleTextOf(rule))
      }
    } else {
      for (const rule of rulesOf(options?.renamedRule === true)) {
        yield* fileSystem.writeFileString(paths.join(packDir, `${rule.stem}.md`), ruleTextOf(rule))
      }
    }
    return { provider, datasetDir, packDir, reportPath, cacheDir } satisfies EvaluateWorld
  })

/**
 * The hand-written oracle for the greenhouse fixture: one row per rule and
 * split, counts read straight off the labels and the scripted answers.
 */
export const expectedCounts: Readonly<
  Record<string, { readonly tp: number; readonly fn: number; readonly fp: number; readonly tn: number }>
> = {
  'watering-schedule/dev': { tp: 1, fn: 0, fp: 0, tn: 1 },
  'watering-schedule/test': { tp: 1, fn: 0, fp: 0, tn: 2 },
  'prune-everything/dev': { tp: 0, fn: 0, fp: 1, tn: 1 },
  'prune-everything/test': { tp: 2, fn: 0, fp: 1, tn: 0 },
  'seed-labelling/dev': { tp: 0, fn: 0, fp: 0, tn: 0 },
  'seed-labelling/test': { tp: 0, fn: 0, fp: 0, tn: 0 },
}

export const expectedVerdict: Readonly<Record<string, 'RuleScored' | 'RuleInsufficientEvidence' | 'RuleUnlabelled'>> = {
  'watering-schedule/dev': 'RuleScored',
  'watering-schedule/test': 'RuleScored',
  'prune-everything/dev': 'RuleInsufficientEvidence',
  'prune-everything/test': 'RuleScored',
  'seed-labelling/dev': 'RuleUnlabelled',
  'seed-labelling/test': 'RuleUnlabelled',
}

export const evaluationRequest = (world: EvaluateWorld) => ({
  packDirs: [world.packDir],
  datasetDir: world.datasetDir,
  reportPath: world.reportPath,
  selectorModel: askedModel,
  provider: 'openrouter',
  seed: 7,
  iterations: 200,
  confidence: 0.95,
  evidenceFloor: new PackEval.EvidenceFloor({ positives: 1, negatives: 1 }),
})

export const reportAt = (world: EvaluateWorld) => PackEval.DatasetFiles.readJson(world.reportPath, PackEval.EvalReport)
