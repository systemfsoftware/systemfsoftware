import { it } from '@effect/vitest'
import { Equal, Result, Schema } from 'effect'
import { EvidenceFloor } from '../eval-report.schema.js'
import { RoutingLabelEntry, RoutingLabels } from '../labels.schema.js'
import { Pack, PackRule } from '../pack-rule.schema.js'
import type { RuleRouting } from '../score-rule-routing.workflow.js'
import {
  LoadedRuleStems,
  RoutingCounts,
  RoutingInsufficientEvidence,
  RoutingScored,
  RoutingUnlabelled,
  scoreRuleRouting,
  ScoreRuleRoutingCommand,
} from '../score-rule-routing.workflow.js'
import { Task, TaskSet } from '../task-set.schema.js'

const PACK_ID = 'pack-1'
const RULE_STEMS = ['rule-1', 'rule-2'] as const
const SPLITS = ['dev', 'test'] as const

type Split = (typeof SPLITS)[number]
type RuleKind = 'negative' | 'governing' | 'deferred'

/** The label state a task's bit draw names for one rule. Index 3 re-enters `negative`. */
const KINDS: ReadonlyArray<RuleKind> = ['negative', 'governing', 'deferred', 'negative']

interface Cell {
  readonly taskId: string
  readonly stem: string
  readonly split: Split
  readonly governs: boolean
  readonly loaded: boolean
}

/** One task's label and selector state, written out rather than drawn. */
interface TaskSpec {
  readonly id: string
  readonly split: Split
  readonly labelled: boolean
  readonly governing: ReadonlyArray<string>
  readonly deferred: ReadonlyArray<string>
  readonly loaded: ReadonlyArray<string>
}

const bitsOf = (draw: number): number => Math.abs(draw) % 128

const bitFor = (bits: ReadonlyArray<number>, index: number): number => bits[index] ?? 0

const entryBit = (bits: number): boolean => (bits & 1) === 1

const kindAt = (bits: number, cell: number): RuleKind => KINDS[(bits >> (1 + cell * 2)) & 3] ?? 'negative'

const loadedAt = (bits: number, cell: number): boolean => ((bits >> (5 + cell)) & 1) === 1

const governingOf = (bits: number): ReadonlyArray<string> =>
  RULE_STEMS.filter((_, index) => kindAt(bits, index) === 'governing')

const deferredOf = (bits: number): ReadonlyArray<string> =>
  RULE_STEMS.filter((_, index) => kindAt(bits, index) === 'deferred')

const loadedOf = (bits: number): ReadonlyArray<string> => RULE_STEMS.filter((_, index) => loadedAt(bits, index))

const packOf = (): Pack =>
  new Pack({
    id: PACK_ID,
    rules: RULE_STEMS.map((stem, index) =>
      new PackRule({
        packId: PACK_ID,
        stem,
        title: `Rule ${index + 1}`,
        appliesWhen: ['always'],
        tags: [],
        body: 'a body',
      })
    ),
  })

const cellsOfTask = (spec: TaskSpec, bits: number): ReadonlyArray<Cell> =>
  RULE_STEMS.flatMap((stem, index) =>
    kindAt(bits, index) === 'deferred' ? [] : [
      {
        taskId: spec.id,
        stem,
        split: spec.split,
        governs: kindAt(bits, index) === 'governing',
        loaded: loadedAt(bits, index),
      },
    ]
  )

const commandOfSpecs = (
  specs: ReadonlyArray<TaskSpec>,
  floor: EvidenceFloor | undefined,
): ScoreRuleRoutingCommand => {
  const input = {
    packs: [packOf()],
    taskSet: new TaskSet({
      version: 1,
      tasks: specs.map((spec) => new Task({ id: spec.id, text: `task ${spec.id}`, split: spec.split, dimensions: {} })),
    }),
    routingLabels: new RoutingLabels({
      version: 1,
      entries: specs.filter((spec) => spec.labelled).map((spec) =>
        new RoutingLabelEntry({
          taskId: spec.id,
          packId: PACK_ID,
          governing: spec.governing,
          deferred: spec.deferred,
        })
      ),
    }),
    loaded: specs.map((spec) => new LoadedRuleStems({ taskId: spec.id, packId: PACK_ID, stems: spec.loaded })),
  }
  return floor === undefined
    ? new ScoreRuleRoutingCommand(input)
    : new ScoreRuleRoutingCommand({ ...input, evidenceFloor: floor })
}

const bit = (flag: boolean): 0 | 1 => (flag ? 1 : 0)

const countsOf = (positives: ReadonlyArray<Cell>, negatives: ReadonlyArray<Cell>): RoutingCounts =>
  new RoutingCounts({
    truePositives: positives.filter((cell) => cell.loaded).length,
    falseNegatives: positives.filter((cell) => !cell.loaded).length,
    falsePositives: negatives.filter((cell) => cell.loaded).length,
    trueNegatives: negatives.filter((cell) => !cell.loaded).length,
  })

const referenceRowOf = (
  stem: string,
  split: Split,
  cells: ReadonlyArray<Cell>,
  floor: EvidenceFloor,
): RuleRouting => {
  const ruleCells = cells.filter((cell) => cell.stem === stem)
  const splitCells = ruleCells.filter((cell) => cell.split === split)
  const positives = splitCells.filter((cell) => cell.governs)
  const negatives = splitCells.filter((cell) => !cell.governs)
  const base = { packId: PACK_ID, stem, split, counts: countsOf(positives, negatives) }
  return ruleCells.length === 0
    ? new RoutingUnlabelled(base)
    : positives.length >= Math.max(floor.positives, 1) && negatives.length >= Math.max(floor.negatives, 1)
    ? new RoutingScored({
      ...base,
      positiveOutcomes: positives.map((cell) => bit(cell.loaded)),
      negativeOutcomes: negatives.map((cell) => bit(!cell.loaded)),
    })
    : new RoutingInsufficientEvidence(base)
}

const referenceRows = (cells: ReadonlyArray<Cell>, floor: EvidenceFloor): ReadonlyArray<RuleRouting> =>
  RULE_STEMS.flatMap((stem) => SPLITS.map((split) => referenceRowOf(stem, split, cells, floor)))

const rowsOf = (command: ScoreRuleRoutingCommand): ReadonlyArray<RuleRouting> =>
  Result.getOrThrow(scoreRuleRouting(command))

const rowAt = (rows: ReadonlyArray<RuleRouting>, stem: string, split: Split): RuleRouting | undefined =>
  rows.find((row) => row.stem === stem && row.split === split)

const MISSING = new RoutingCounts({
  truePositives: -1,
  falseNegatives: -1,
  falsePositives: -1,
  trueNegatives: -1,
})

const countsAt = (rows: ReadonlyArray<RuleRouting>, stem: string, split: Split): RoutingCounts =>
  rowAt(rows, stem, split)?.counts ?? MISSING

it.prop(
  '∀s_routingLabelsAndLoads_≡CountsMarksAndVectorsMatchTheLabelSet',
  [Schema.Int, Schema.Int, Schema.Int, Schema.Int, Schema.Int],
  ([task1Draw, task2Draw, task3Draw, positivesDraw, negativesDraw]) => {
    const taskDraws = [task1Draw, task2Draw, task3Draw]
    const drawn = taskDraws.map(bitsOf)
    const floorOmitted = Math.abs(positivesDraw) % 5 === 4
    const floor = floorOmitted
      ? new EvidenceFloor({ positives: 3, negatives: 3 })
      : new EvidenceFloor({ positives: Math.abs(positivesDraw) % 4, negatives: Math.abs(negativesDraw) % 4 })
    const baseTasks: ReadonlyArray<{ readonly id: string; readonly split: Split }> = [
      { id: 'task-1', split: 'dev' },
      { id: 'task-2', split: 'dev' },
      { id: 'task-3', split: 'test' },
    ]
    const specs: ReadonlyArray<TaskSpec> = baseTasks.map((spec, index) => ({
      ...spec,
      labelled: entryBit(bitFor(drawn, index)),
      governing: governingOf(bitFor(drawn, index)),
      deferred: deferredOf(bitFor(drawn, index)),
      loaded: loadedOf(bitFor(drawn, index)),
    }))
    const cells = specs.flatMap((spec, index) => spec.labelled ? cellsOfTask(spec, bitFor(drawn, index)) : [])
    return Equal.equals(
      rowsOf(commandOfSpecs(specs, floorOmitted ? undefined : floor)),
      referenceRows(cells, floor),
    )
  },
)

it.prop(
  '∀s_governingLoadedCell_≡TruePositiveRisesByOne',
  [Schema.Int, Schema.Int],
  ([otherDraw, floorDraw]) => {
    const other = bitsOf(otherDraw)
    const floor = new EvidenceFloor({ positives: Math.abs(floorDraw) % 4, negatives: Math.abs(floorDraw >> 2) % 4 })
    const task1 = (governing: ReadonlyArray<string>, loaded: ReadonlyArray<string>): TaskSpec => ({
      id: 'task-1',
      split: 'dev',
      labelled: true,
      governing,
      deferred: [],
      loaded,
    })
    const otherTasks: ReadonlyArray<TaskSpec> = [
      {
        id: 'task-2',
        split: 'dev',
        labelled: entryBit(other),
        governing: governingOf(other),
        deferred: deferredOf(other),
        loaded: loadedOf(other),
      },
      { id: 'task-3', split: 'test', labelled: true, governing: [], deferred: [], loaded: [] },
    ]
    const before = countsAt(rowsOf(commandOfSpecs([task1([], []), ...otherTasks], floor)), 'rule-1', 'dev')
    const after = countsAt(
      rowsOf(commandOfSpecs([task1(['rule-1'], ['rule-1']), ...otherTasks], floor)),
      'rule-1',
      'dev',
    )
    return after.truePositives === before.truePositives + 1 &&
      after.trueNegatives === before.trueNegatives - 1 &&
      after.falsePositives === before.falsePositives &&
      after.falseNegatives === before.falseNegatives
  },
)

it.prop(
  '∀s_nonGoverningLoadedCell_≡FalsePositiveRisesByOneAndTnrDrops',
  [Schema.Int],
  ([otherDraw]) => {
    const other = bitsOf(otherDraw)
    const floor = new EvidenceFloor({ positives: 1, negatives: 1 })
    const specs = (loaded: ReadonlyArray<string>): ReadonlyArray<TaskSpec> => [
      { id: 'task-1', split: 'dev', labelled: true, governing: [], deferred: [], loaded },
      { id: 'task-2', split: 'dev', labelled: true, governing: ['rule-2'], deferred: [], loaded: ['rule-2'] },
      {
        id: 'task-3',
        split: 'test',
        labelled: entryBit(other),
        governing: governingOf(other),
        deferred: deferredOf(other),
        loaded: loadedOf(other),
      },
    ]
    const beforeRows = rowsOf(commandOfSpecs(specs([]), floor))
    const afterRows = rowsOf(commandOfSpecs(specs(['rule-2']), floor))
    const before = countsAt(beforeRows, 'rule-2', 'dev')
    const after = countsAt(afterRows, 'rule-2', 'dev')
    const afterRow = rowAt(afterRows, 'rule-2', 'dev')
    return after.falsePositives === before.falsePositives + 1 &&
      after.trueNegatives === before.trueNegatives - 1 &&
      Equal.equals(countsAt(afterRows, 'rule-2', 'test'), countsAt(beforeRows, 'rule-2', 'test')) &&
      Schema.is(RoutingScored)(afterRow) &&
      afterRow.negativeOutcomes.includes(0) &&
      afterRow.counts.trueNegatives < afterRow.negativeOutcomes.length
  },
)

it.prop(
  '∀s_floorAboveTheEvidence_≡InsufficientWithCountsIntact',
  [Schema.Int, Schema.Int],
  ([positivesDraw, negativesDraw]) => {
    const positives = 1 + (Math.abs(positivesDraw) % 3)
    const negatives = 1 + (Math.abs(negativesDraw) % 3)
    const positiveSpecs: ReadonlyArray<TaskSpec> = Array.from({ length: positives }, (_, index) => ({
      id: `positive-${index}`,
      split: 'dev',
      labelled: true,
      governing: ['rule-1'],
      deferred: [],
      loaded: ['rule-1'],
    }))
    const negativeSpecs: ReadonlyArray<TaskSpec> = Array.from({ length: negatives }, (_, index) => ({
      id: `negative-${index}`,
      split: 'dev',
      labelled: true,
      governing: [],
      deferred: [],
      loaded: [],
    }))
    const deferredSpecs: ReadonlyArray<TaskSpec> = Array.from({ length: 2 }, (_, index) => ({
      id: `deferred-${index}`,
      split: 'test',
      labelled: true,
      governing: [],
      deferred: ['rule-1'],
      loaded: ['rule-1'],
    }))
    const specs = [...positiveSpecs, ...negativeSpecs, ...deferredSpecs]
    const atFloor = rowsOf(commandOfSpecs(specs, new EvidenceFloor({ positives, negatives })))
    const abovePositiveFloor = rowsOf(commandOfSpecs(specs, new EvidenceFloor({ positives: positives + 1, negatives })))
    const aboveNegativeFloor = rowsOf(commandOfSpecs(specs, new EvidenceFloor({ positives, negatives: negatives + 1 })))
    return Schema.is(RoutingScored)(rowAt(atFloor, 'rule-1', 'dev')) &&
      Schema.is(RoutingInsufficientEvidence)(rowAt(abovePositiveFloor, 'rule-1', 'dev')) &&
      Schema.is(RoutingInsufficientEvidence)(rowAt(aboveNegativeFloor, 'rule-1', 'dev')) &&
      Equal.equals(countsAt(atFloor, 'rule-1', 'dev'), countsAt(abovePositiveFloor, 'rule-1', 'dev')) &&
      Equal.equals(countsAt(abovePositiveFloor, 'rule-1', 'dev'), countsAt(aboveNegativeFloor, 'rule-1', 'dev'))
  },
)

it.prop(
  '∀s_ruleWithoutLabels_≡UnlabelledInBothSplitsWithZeroCounts',
  [Schema.Int],
  ([draw]) => {
    const specs: ReadonlyArray<TaskSpec> = [
      { id: 'task-1', split: 'dev', labelled: false, governing: [], deferred: [], loaded: loadedOf(bitsOf(draw)) },
      { id: 'task-2', split: 'test', labelled: false, governing: [], deferred: [], loaded: [] },
    ]
    const rows = rowsOf(commandOfSpecs(specs, undefined))
    return rows.length === RULE_STEMS.length * SPLITS.length &&
      rows.every((row) =>
        Schema.is(RoutingUnlabelled)(row) &&
        Equal.equals(
          row.counts,
          new RoutingCounts({ truePositives: 0, falseNegatives: 0, falsePositives: 0, trueNegatives: 0 }),
        )
      )
  },
)

it.prop(
  '∀s_deferredStem_≡ItsCellLeavesEveryCount',
  [Schema.Int],
  ([draw]) => {
    const stem = RULE_STEMS[Math.abs(draw) % RULE_STEMS.length] ?? 'rule-1'
    const floor = new EvidenceFloor({ positives: 1, negatives: 1 })
    const specs = (deferred: ReadonlyArray<string>): ReadonlyArray<TaskSpec> => [
      { id: 'task-1', split: 'dev', labelled: true, governing: [], deferred, loaded: [stem] },
      { id: 'task-2', split: 'dev', labelled: true, governing: [], deferred: [], loaded: [] },
      { id: 'task-3', split: 'test', labelled: true, governing: [stem], deferred: [], loaded: [stem] },
    ]
    const before = countsAt(rowsOf(commandOfSpecs(specs([]), floor)), stem, 'dev')
    const after = countsAt(rowsOf(commandOfSpecs(specs([stem]), floor)), stem, 'dev')
    return after.falsePositives === before.falsePositives - 1 &&
      after.trueNegatives === before.trueNegatives &&
      after.falseNegatives === before.falseNegatives &&
      after.truePositives === before.truePositives
  },
)
