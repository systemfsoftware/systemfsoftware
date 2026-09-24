import { OpenRouterClient, OpenRouterLanguageModel } from '@effect/ai-openrouter'
import { PackEval } from '@systemfsoftware/pack-eval'
import { Console, Effect, Layer, Redacted, Schema } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import * as Path from 'effect/Path'
import { type RuleSource, ruleTextOf, servedModel, stemsReply } from './discovery-dataset.fixture.js'
import { type LoopbackReply, OpenRouterLoopback, type OpenRouterLoopbackShape } from './openrouter-loopback.fixture.js'

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
    yield* PackEval.DatasetFiles.writeJson(
      paths.join(datasetDir, 'pair-labels.json'),
      PackEval.PairLabels,
      new PackEval.PairLabels({ version: 1, entries: [] }),
    )
    yield* PackEval.DatasetFiles.writeJson(
      paths.join(datasetDir, 'judge-prompt.json'),
      PackEval.JudgePrompt,
      new PackEval.JudgePrompt({
        criterion: contradictionJudgePrompt.criterion,
        passDefinition: contradictionJudgePrompt.passDefinition,
        failDefinition: contradictionJudgePrompt.failDefinition,
        fewShotPairIds: [],
      }),
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

// ---------------------------------------------------------------------------
// Phase B: contradiction. The same greenhouse pack, a task set whose routing
// labels witness one pair on every task, and pair labels in train, dev, and
// test. Only the pair (prune-everything, watering-schedule) is ever witnessed:
// no task governs seed-labelling with anything, so the two pairs naming it stay
// unwitnessed.
// ---------------------------------------------------------------------------

export const judgeAskedModel = 'acme/judge-large'

export const judgeServedModel = 'acme/judge-large@acme'

export const contradictionFailTaskIds: ReadonlyArray<string> = [
  'task-fail-1',
  'task-fail-2',
  'task-fail-3',
  'task-fail-4',
  'task-fail-5',
]

export const contradictionPassTaskIds: ReadonlyArray<string> = ['task-pass-1', 'task-pass-2']

export const contradictionDevTaskId = 'task-dev-pair'

export const contradictionTrainTaskId = 'task-train-pair'

const contradictionTaskTexts: Readonly<Record<string, string>> = {
  'task-fail-1': 'Clear the north rows back to the wire before the frost',
  'task-fail-2': 'Trim the row covers that sit on the drip line',
  'task-fail-3': 'Cut back the low shoots over the soaker hose',
  'task-fail-4': 'Thin the hedge that leans on the irrigation trench',
  'task-fail-5': 'Prune the vines that shade the misting heads',
  'task-pass-1': 'Repot the seedlings into the raised bed',
  'task-pass-2': 'Hang the shade cloth before the hot week',
  'task-dev-pair': 'Stake the tomato rows before the weekend',
  'task-train-pair': 'Sweep the walkway between the beds',
}

const isTestTaskId = (taskId: string): boolean =>
  contradictionFailTaskIds.includes(taskId) || contradictionPassTaskIds.includes(taskId)

export const contradictionTasks: ReadonlyArray<PackEval.Task> = [
  ...contradictionFailTaskIds,
  ...contradictionPassTaskIds,
  contradictionDevTaskId,
  contradictionTrainTaskId,
].map((id) =>
  new PackEval.Task({
    id,
    text: contradictionTaskTexts[id] ?? id,
    split: isTestTaskId(id) ? 'test' : 'dev',
    dimensions: {},
  })
)

/** Every task in this world needs both rules, so the one pair is witnessed by all of them. */
export const contradictionRoutingLabels = new PackEval.RoutingLabels({
  version: 1,
  entries: contradictionTasks.map((task) =>
    new PackEval.RoutingLabelEntry({
      taskId: task.id,
      packId: evaluatePackId,
      governing: ['watering-schedule', 'prune-everything'],
      deferred: ['seed-labelling'],
    })
  ),
})

export type ContradictionFailOrigin = 'observed' | 'planted'

export interface ContradictionPlan {
  /** Whether the Fail labels carry a rewritten watering body, or the pack's own. */
  readonly failOrigin: ContradictionFailOrigin
  /** The judge's verdict on each Fail label, in task order. */
  readonly failVerdicts: ReadonlyArray<'Pass' | 'Fail'>
}

/** AE3: every Fail label's verdict matches its label, so the judge validates. */
export const observedSharpPlan: ContradictionPlan = {
  failOrigin: 'observed',
  failVerdicts: ['Fail', 'Fail', 'Fail', 'Fail', 'Fail'],
}

/** AE4: three of five Fail labels are caught, so TNR lands at 0.6. */
export const observedBluntedPlan: ContradictionPlan = {
  failOrigin: 'observed',
  failVerdicts: ['Fail', 'Fail', 'Fail', 'Pass', 'Pass'],
}

export const plantedPartialPlan: ContradictionPlan = {
  failOrigin: 'planted',
  failVerdicts: ['Fail', 'Fail', 'Fail', 'Fail', 'Pass'],
}

/**
 * The rate scenario. Every Fail label is planted, so the rewritten body is what
 * the judge validates against, while the pack's own pair — which is not
 * contradictory — is the pair the witnessed run judges.
 */
export const plantedSharpPlan: ContradictionPlan = {
  failOrigin: 'planted',
  failVerdicts: ['Fail', 'Fail', 'Fail', 'Fail', 'Fail'],
}

const PASS_NOTES = 'one walk-through can satisfy both rules'

const PLANTED_RULE_B_BODY = 'Water every second morning, and never water a row you have pruned.'

const failNotesOf = (origin: ContradictionFailOrigin, taskId: string): string =>
  origin === 'planted'
    ? `the watered rows were rewritten to forbid watering anything pruned (${taskId})`
    : `the pruning cut removes the shoots the watering schedule keeps wet (${taskId})`

export const failCritiqueText = (taskId: string): string => failNotesOf('observed', taskId)

export const cardPairLine = 'prune-everything × watering-schedule'

const passNotesOf = (taskId: string): string => `${PASS_NOTES} (${taskId})`
interface PairLabelOptions {
  readonly id: string
  readonly taskId: string
  readonly split: 'train' | 'dev' | 'test'
  readonly verdict: 'Pass' | 'Fail'
  readonly origin: ContradictionFailOrigin
  readonly notes: string
  readonly plantedBody?: string | undefined
}

const pairLabelOf = (options: PairLabelOptions): PackEval.PairLabel =>
  new PackEval.PairLabel({
    id: options.id,
    taskId: options.taskId,
    packId: evaluatePackId,
    ruleA: 'prune-everything',
    ruleB: 'watering-schedule',
    split: options.split,
    verdict: options.verdict,
    origin: options.origin,
    notes: options.notes,
    ...(options.plantedBody === undefined ? {} : { plantedBody: options.plantedBody }),
  })

export const contradictionPairLabels = (plan: ContradictionPlan): PackEval.PairLabels =>
  new PackEval.PairLabels({
    version: 1,
    entries: [
      pairLabelOf({
        id: 'pair-train-1',
        taskId: contradictionTrainTaskId,
        split: 'train',
        verdict: 'Pass',
        origin: 'observed',
        notes: PASS_NOTES,
      }),
      pairLabelOf({
        id: 'pair-dev-1',
        taskId: contradictionDevTaskId,
        split: 'dev',
        verdict: 'Pass',
        origin: 'observed',
        notes: PASS_NOTES,
      }),
      ...contradictionFailTaskIds.map((taskId, index) =>
        pairLabelOf({
          id: `pair-fail-${index + 1}`,
          taskId,
          split: 'test',
          verdict: 'Fail',
          origin: plan.failOrigin,
          notes: failNotesOf(plan.failOrigin, taskId),
          ...(plan.failOrigin === 'planted' ? { plantedBody: PLANTED_RULE_B_BODY } : {}),
        })
      ),
      ...contradictionPassTaskIds.map((taskId, index) =>
        pairLabelOf({
          id: `pair-pass-${index + 1}`,
          taskId,
          split: 'test',
          verdict: 'Pass',
          origin: 'observed',
          notes: PASS_NOTES,
        })
      ),
    ],
  })

export const contradictionJudgePrompt = new PackEval.JudgePrompt({
  criterion: 'On this task, can one change satisfy both rules?',
  passDefinition: 'Pass: one change can satisfy both rules at once.',
  failDefinition: 'Fail: no single change satisfies both rules together.',
  fewShotPairIds: ['pair-train-1'],
})

const judgeCompletionOf = (content: string): LoopbackReply => ({
  status: 200,
  body: {
    id: 'judge-loopback-1',
    object: 'chat.completion',
    created: 1_760_000_000,
    model: judgeServedModel,
    system_fingerprint: null,
    choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content } }],
  },
})

const judgeReplyOf = (
  reply: PackEval.JudgeReply,
): Effect.Effect<LoopbackReply, Schema.SchemaError> =>
  Effect.map(Schema.encodeEffect(Schema.fromJsonString(PackEval.JudgeReply))(reply), judgeCompletionOf)

/**
 * The provider script, in request order. The selector is asked once per task
 * first. Then the judge is asked for each test label (validity) and for each
 * witnessed pair on each task — but an identical question is answered from the
 * cache, so a task whose real bodies were already judged is not asked again.
 * A planted label's question differs from its task's real pair, so it is asked
 * twice.
 */
const contradictionRepliesOf = (
  plan: ContradictionPlan,
): ReadonlyArray<Effect.Effect<LoopbackReply, Schema.SchemaError>> => [
  ...contradictionTasks.map(() => stemsReply([])),
  ...contradictionFailTaskIds.map((taskId, index) => {
    const verdict = plan.failVerdicts[index] ?? 'Fail'
    return judgeReplyOf({
      critique: verdict === 'Fail' ? failNotesOf(plan.failOrigin, taskId) : passNotesOf(taskId),
      verdict,
    })
  }),
  ...contradictionPassTaskIds.map((taskId) => judgeReplyOf({ critique: passNotesOf(taskId), verdict: 'Pass' })),
  judgeReplyOf({ critique: passNotesOf(contradictionDevTaskId), verdict: 'Pass' }),
  ...(plan.failOrigin === 'planted'
    ? contradictionFailTaskIds.map((taskId) => judgeReplyOf({ critique: passNotesOf(taskId), verdict: 'Pass' }))
    : []),
  judgeReplyOf({ critique: passNotesOf(contradictionTrainTaskId), verdict: 'Pass' }),
]

/** How many questions reach the provider for a plan, cache hits excluded. */
export const contradictionJudgeCallCount = (plan: ContradictionPlan): number =>
  contradictionFailTaskIds.length +
  contradictionPassTaskIds.length +
  1 +
  (plan.failOrigin === 'planted' ? contradictionFailTaskIds.length : 0) +
  1

export interface ContradictionWorld {
  readonly provider: OpenRouterLoopbackShape
  readonly datasetDir: string
  readonly packDir: string
  readonly reportPath: string
  readonly cacheDir: string
  readonly judgeCalls: number
}

export const contradictionWorld = (plan: ContradictionPlan) =>
  Effect.gen(function*() {
    const provider = yield* OpenRouterLoopback
    const fileSystem = yield* FileSystem.FileSystem
    const paths = yield* Path.Path
    yield* provider.answerWith(yield* Effect.all(contradictionRepliesOf(plan)))
    const base = yield* fileSystem.makeTempDirectoryScoped()
    const datasetDir = paths.join(base, 'dataset')
    const packDir = paths.join(base, 'packs', evaluatePackId)
    const reportPath = paths.join(base, 'report.json')
    const cacheDir = paths.join(base, 'cache')
    yield* fileSystem.makeDirectory(datasetDir, { recursive: true })
    yield* fileSystem.makeDirectory(packDir, { recursive: true })
    for (const rule of greenhouseRules) {
      yield* fileSystem.writeFileString(paths.join(packDir, `${rule.stem}.md`), ruleTextOf(rule))
    }
    yield* PackEval.DatasetFiles.writeJson(
      paths.join(datasetDir, 'selector-instruction.json'),
      PackEval.SelectorInstruction,
      evaluationInstruction,
    )
    yield* PackEval.DatasetFiles.writeJson(
      paths.join(datasetDir, 'tasks.json'),
      PackEval.TaskSet,
      new PackEval.TaskSet({ version: 1, tasks: contradictionTasks }),
    )
    yield* PackEval.DatasetFiles.writeJson(
      paths.join(datasetDir, 'routing-labels.json'),
      PackEval.RoutingLabels,
      contradictionRoutingLabels,
    )
    yield* PackEval.DatasetFiles.writeJson(
      paths.join(datasetDir, 'pair-labels.json'),
      PackEval.PairLabels,
      contradictionPairLabels(plan),
    )
    yield* PackEval.DatasetFiles.writeJson(
      paths.join(datasetDir, 'judge-prompt.json'),
      PackEval.JudgePrompt,
      contradictionJudgePrompt,
    )
    return {
      provider,
      datasetDir,
      packDir,
      reportPath,
      cacheDir,
      judgeCalls: contradictionJudgeCallCount(plan),
    } satisfies ContradictionWorld
  })

export interface ContradictionRequestOptions {
  readonly world: ContradictionWorld
  readonly judgeModel?: string | undefined
  readonly judgeMinimum?: number | undefined
}

export const contradictionRequest = (options: ContradictionRequestOptions) => ({
  packDirs: [options.world.packDir],
  datasetDir: options.world.datasetDir,
  reportPath: options.world.reportPath,
  selectorModel: askedModel,
  provider: 'openrouter',
  seed: 7,
  iterations: 200,
  confidence: 0.95,
  evidenceFloor: new PackEval.EvidenceFloor({ positives: 1, negatives: 1 }),
  judgeModel: options.judgeModel === undefined ? judgeAskedModel : options.judgeModel,
  judgeMinimum: options.judgeMinimum ?? 0.8,
})

const recordingConsoleOf = (lines: Array<string>): Console.Console =>
  Object.assign(Object.create(console), {
    log: (message: string) => {
      lines.push(message)
    },
  })

export interface JudgeStackOptions {
  readonly world: ContradictionWorld
  readonly lines: Array<string>
}

export const judgeStackOf = (options: JudgeStackOptions) =>
  Layer.provideMerge(
    Layer.merge(
      Layer.provideMerge(
        Layer.provideMerge(
          PackEval.OpenRouterRuleSelector.layer({ model: askedModel }),
          PackEval.FileAnswerCache.layer({ cacheDir: options.world.cacheDir }),
        ),
        OpenRouterLanguageModel.layer({ model: askedModel }),
      ),
      Layer.provideMerge(
        Layer.provideMerge(
          PackEval.OpenRouterContradictionJudge.layer({ model: judgeAskedModel }),
          PackEval.FileAnswerCache.layer({ cacheDir: options.world.cacheDir }),
        ),
        OpenRouterLanguageModel.layer({ model: judgeAskedModel }),
      ),
    ),
    Layer.mergeAll(
      OpenRouterClient.layer({ apiUrl: options.world.provider.apiUrl, apiKey: Redacted.make('sk-loopback') }),
      Layer.succeed(Console.Console, recordingConsoleOf(options.lines)),
    ),
  )
