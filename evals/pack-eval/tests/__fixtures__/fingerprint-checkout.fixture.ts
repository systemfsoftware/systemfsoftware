import { PackEval } from '@systemfsoftware/pack-eval'
import { Effect } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import * as Path from 'effect/Path'
import { type RuleSource, ruleTextOf } from './discovery-dataset.fixture.js'
import {
  evaluatePackId,
  evaluationInstruction,
  evaluationRoutingLabels,
  evaluationTasks,
} from './evaluate-pack.fixture.js'

export interface FingerprintCheckout {
  readonly packDir: string
  readonly datasetDir: string
  readonly codeRoot: string
  readonly lockfilePath: string
}

const RULE_BYTE = 'Water every second morning and write the amount in the log.'
const RULE_BYTE_CHANGED = 'Water every morning and write the amount in the log.'

const checkoutRules: ReadonlyArray<RuleSource> = [
  {
    stem: 'watering-schedule',
    title: 'Water on a schedule',
    appliesWhen: ['touching the watering plan'],
    tags: ['water'],
    body: RULE_BYTE,
  },
  {
    stem: 'prune-everything',
    title: 'Prune after every walk-through',
    appliesWhen: ['walking the rows for any reason'],
    tags: ['prune'],
    body: 'Cut back every shoot that crossed the wire.',
  },
]

const INSTRUCTION_BYTE = 'Load every rule whose applies_when matches the work the task describes.'

const JUDGE_CRITERION = 'On this task, can one change satisfy both rules?'

const checkoutJudgePrompt = (changed: boolean): PackEval.JudgePrompt =>
  new PackEval.JudgePrompt({
    criterion: changed ? `${JUDGE_CRITERION} Count the shoots too.` : JUDGE_CRITERION,
    passDefinition: 'Pass: one change can satisfy both rules at once.',
    failDefinition: 'Fail: no single change satisfies both rules together.',
    fewShotPairIds: [],
  })

const checkoutPairLabels = (changed: boolean): PackEval.PairLabels =>
  new PackEval.PairLabels({
    version: 1,
    entries: [
      new PackEval.PairLabel({
        id: 'pair-greenhouse-1',
        taskId: 'task-vent',
        packId: evaluatePackId,
        ruleA: 'watering-schedule',
        ruleB: 'prune-everything',
        split: 'test',
        verdict: 'Pass',
        origin: 'observed',
        notes: changed ? 'the walk-through satisfies both rules twice over' : 'one walk-through can satisfy both rules',
      }),
    ],
  })
export interface CheckoutMutation {
  readonly ruleByte?: boolean
  readonly labelByte?: boolean
  readonly instructionByte?: boolean
  readonly judgePromptByte?: boolean
  readonly pairLabelByte?: boolean
  readonly outsideFile?: boolean
}

export interface CheckoutOptions {
  readonly baseDir: string
  readonly mutation?: CheckoutMutation | undefined
}

export const writeFingerprintCheckout = (options: CheckoutOptions) =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem
    const paths = yield* Path.Path
    const mutation = options.mutation
    const datasetDir = paths.join(options.baseDir, 'dataset')
    const packDir = paths.join(options.baseDir, 'packs', evaluatePackId)
    const codeRoot = paths.join(options.baseDir, 'code')
    const lockfilePath = paths.join(options.baseDir, 'pnpm-lock.yaml')
    yield* fileSystem.makeDirectory(datasetDir, { recursive: true })
    yield* fileSystem.makeDirectory(packDir, { recursive: true })
    yield* fileSystem.makeDirectory(paths.join(codeRoot, 'src', 'drivers'), { recursive: true })
    const rules = mutation?.ruleByte === true
      ? checkoutRules.map((rule) => rule.stem === 'watering-schedule' ? { ...rule, body: RULE_BYTE_CHANGED } : rule)
      : checkoutRules
    for (const rule of rules) {
      yield* fileSystem.writeFileString(paths.join(packDir, `${rule.stem}.md`), ruleTextOf(rule))
    }
    const instructionText = mutation?.instructionByte === true ? `${INSTRUCTION_BYTE} Be generous.` : INSTRUCTION_BYTE
    const instruction = new PackEval.SelectorInstruction({
      text: instructionText,
      provenance: evaluationInstruction.provenance,
    })
    yield* PackEval.DatasetFiles.writeJson(
      paths.join(datasetDir, 'selector-instruction.json'),
      PackEval.SelectorInstruction,
      instruction,
    )
    yield* PackEval.DatasetFiles.writeJson(
      paths.join(datasetDir, 'tasks.json'),
      PackEval.TaskSet,
      new PackEval.TaskSet({ version: 1, tasks: evaluationTasks }),
    )
    const labels = mutation?.labelByte === true
      ? new PackEval.RoutingLabels({
        version: 1,
        entries: evaluationRoutingLabels.entries.filter((entry) => entry.taskId !== 'task-vent'),
      })
      : evaluationRoutingLabels
    yield* PackEval.DatasetFiles.writeJson(
      paths.join(datasetDir, 'routing-labels.json'),
      PackEval.RoutingLabels,
      labels,
    )
    yield* PackEval.DatasetFiles.writeJson(
      paths.join(datasetDir, 'judge-prompt.json'),
      PackEval.JudgePrompt,
      checkoutJudgePrompt(mutation?.judgePromptByte === true),
    )
    yield* PackEval.DatasetFiles.writeJson(
      paths.join(datasetDir, 'pair-labels.json'),
      PackEval.PairLabels,
      checkoutPairLabels(mutation?.pairLabelByte === true),
    )
    yield* fileSystem.writeFileString(paths.join(codeRoot, 'src', 'evaluate.ts'), 'export const evaluate = 1\n')
    yield* fileSystem.writeFileString(paths.join(codeRoot, 'src', 'drivers', 'score.ts'), 'export const score = 2\n')
    yield* fileSystem.writeFileString(lockfilePath, 'lockfileVersion: 9.0\n')
    if (mutation?.outsideFile === true) {
      yield* fileSystem.writeFileString(paths.join(codeRoot, 'README.md'), 'a note nobody digests\n')
      yield* fileSystem.writeFileString(paths.join(datasetDir, 'notes.txt'), 'owner scratch, not an input\n')
    }
    return { packDir, datasetDir, codeRoot, lockfilePath } satisfies FingerprintCheckout
  })

export interface FingerprintRequestInput {
  readonly checkout: FingerprintCheckout
  readonly selectorModel?: string | undefined
  readonly judgeModel?: string | undefined
  readonly judgeMinimum?: number | undefined
  readonly seed?: number | undefined
}

export const fingerprintRequest = (options: FingerprintRequestInput) => ({
  packDirs: [options.checkout.packDir],
  datasetDir: options.checkout.datasetDir,
  codeRoot: options.checkout.codeRoot,
  lockfilePath: options.checkout.lockfilePath,
  selectorModel: options.selectorModel ?? 'acme/planner-large',
  judgeModel: options.judgeModel,
  judgeMinimum: options.judgeMinimum ?? 0.8,
  seed: options.seed ?? 7,
  iterations: 200,
  confidence: 0.95,
  evidenceFloor: new PackEval.EvidenceFloor({ positives: 1, negatives: 1 }),
})
