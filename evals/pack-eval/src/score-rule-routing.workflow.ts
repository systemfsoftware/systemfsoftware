import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Array as Arr, Match, Number as Num, Option, Result, Schema } from 'effect'
import { EvidenceFloor } from './eval-report.schema.js'
import type { RoutingLabelEntry } from './labels.schema.js'
import { RoutingLabels } from './labels.schema.js'
import { Pack } from './pack-rule.schema.js'
import { TaskSet, TaskSplit } from './task-set.schema.js'
import type { Task } from './task-set.schema.js'

/**
 * The decision rows and their counts are declared here rather than in a sibling
 * `*.schema.ts`: a decision's pure body may reference no other module's values
 * (`make-body-purity`), so the workflow owns every class it constructs. The
 * schema-law generator picks the exported schemas up from this module like any
 * other in `src/`.
 */
const RuleRoutingTypeId: unique symbol = Symbol.for('@systemfsoftware/pack-eval/RuleRouting')
type RuleRoutingTypeId = typeof RuleRoutingTypeId

type Bit = 0 | 1

export class RoutingCounts extends Schema.Class<RoutingCounts>('RoutingCounts')({
  truePositives: Schema.Int,
  falseNegatives: Schema.Int,
  falsePositives: Schema.Int,
  trueNegatives: Schema.Int,
}) {}

/**
 * One scored split's TPR vector: one entry per labelled positive cell, 1 when
 * the selector loaded the rule. And its TNR vector: one entry per labelled
 * negative cell, 1 when it did not. They are exactly the outcome vectors
 * `bootstrap-rate-interval` rates.
 */
export class RoutingScored extends Schema.TaggedClass<RoutingScored>()('RoutingScored', {
  packId: Schema.NonEmptyString,
  stem: Schema.NonEmptyString,
  split: TaskSplit,
  counts: RoutingCounts,
  positiveOutcomes: Schema.Array(Schema.Literals([0, 1])),
  negativeOutcomes: Schema.Array(Schema.Literals([0, 1])),
}) {
  readonly [RuleRoutingTypeId] = RuleRoutingTypeId
}

export class RoutingInsufficientEvidence
  extends Schema.TaggedClass<RoutingInsufficientEvidence>()('RoutingInsufficientEvidence', {
    packId: Schema.NonEmptyString,
    stem: Schema.NonEmptyString,
    split: TaskSplit,
    counts: RoutingCounts,
  })
{
  readonly [RuleRoutingTypeId] = RuleRoutingTypeId
}

export class RoutingUnlabelled extends Schema.TaggedClass<RoutingUnlabelled>()('RoutingUnlabelled', {
  packId: Schema.NonEmptyString,
  stem: Schema.NonEmptyString,
  split: TaskSplit,
  counts: RoutingCounts,
}) {
  readonly [RuleRoutingTypeId] = RuleRoutingTypeId
}

export const RuleRouting = Schema.Union([RoutingScored, RoutingInsufficientEvidence, RoutingUnlabelled])
export type RuleRouting = typeof RuleRouting.Type

export const ScoreRuleRoutingDecision = Schema.Array(RuleRouting)
export type ScoreRuleRoutingDecision = typeof ScoreRuleRoutingDecision.Type

/** The rule stems the selector loaded for one (task, pack) replay. */
export class LoadedRuleStems extends Schema.Class<LoadedRuleStems>('LoadedRuleStems')({
  taskId: Schema.NonEmptyString,
  packId: Schema.NonEmptyString,
  stems: Schema.Array(Schema.NonEmptyString),
}) {}

export class ScoreRuleRoutingCommand extends Schema.Class<ScoreRuleRoutingCommand>('ScoreRuleRoutingCommand')({
  packs: Schema.Array(Pack),
  taskSet: TaskSet,
  routingLabels: RoutingLabels,
  loaded: Schema.Array(LoadedRuleStems),
  evidenceFloor: Schema.optional(EvidenceFloor),
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

const DEFAULT_FLOOR = new EvidenceFloor({ positives: 3, negatives: 3 })

const SPLITS: ReadonlyArray<TaskSplit> = ['dev', 'test']

interface RoutingCell {
  readonly packId: string
  readonly stem: string
  readonly split: TaskSplit
  /** 1 when the label names the rule as governing the task, 0 when it names it as not governing. */
  readonly expected: Bit
  /** 1 when the selector loaded the rule for the task, 0 when it did not. */
  readonly loaded: Bit
}

const bitOf = (flag: boolean): Bit =>
  Match.value(flag).pipe(
    Match.when(true, (): Bit => 1),
    Match.when(false, (): Bit => 0),
    Match.exhaustive,
  )

const invertedBitOf = (bit: Bit): Bit =>
  Match.value(bit).pipe(
    Match.when(0, (): Bit => 1),
    Match.when(1, (): Bit => 0),
    Match.exhaustive,
  )

const isPair = (taskId: string, packId: string) => (entry: LoadedRuleStems): boolean =>
  Arr.every([entry.taskId === taskId, entry.packId === packId], (holds) => holds)

const loadedStemsOf = (
  command: ScoreRuleRoutingCommand,
  taskId: string,
  packId: string,
): ReadonlyArray<string> => command.loaded.filter(isPair(taskId, packId)).flatMap((entry) => entry.stems)

const cellsOfTask = (
  command: ScoreRuleRoutingCommand,
  entry: RoutingLabelEntry,
  task: Task,
  pack: Pack,
): ReadonlyArray<RoutingCell> => {
  const loaded = loadedStemsOf(command, entry.taskId, entry.packId)
  return pack.rules
    .filter((rule) => entry.deferred.includes(rule.stem) === false)
    .map((rule) => ({
      packId: pack.id,
      stem: rule.stem,
      split: task.split,
      expected: bitOf(entry.governing.includes(rule.stem)),
      loaded: bitOf(loaded.includes(rule.stem)),
    }))
}

const cellsOfEntry = (command: ScoreRuleRoutingCommand, entry: RoutingLabelEntry): ReadonlyArray<RoutingCell> =>
  Arr.findFirst(command.taskSet.tasks, (task) => task.id === entry.taskId).pipe(
    Option.flatMap((task) =>
      Option.map(
        Arr.findFirst(command.packs, (pack) => pack.id === entry.packId),
        (pack) => cellsOfTask(command, entry, task, pack),
      )
    ),
    Option.getOrElse((): ReadonlyArray<RoutingCell> => []),
  )

const cellsOf = (command: ScoreRuleRoutingCommand): ReadonlyArray<RoutingCell> =>
  command.routingLabels.entries.flatMap((entry) => cellsOfEntry(command, entry))

const bitSumOf = (cells: ReadonlyArray<RoutingCell>, contribution: (cell: RoutingCell) => number): number =>
  Arr.reduce(cells, 0, (total, cell) => total + contribution(cell))

const countsOf = (cells: ReadonlyArray<RoutingCell>): RoutingCounts =>
  new RoutingCounts({
    truePositives: bitSumOf(cells, (cell) => cell.expected * cell.loaded),
    falseNegatives: bitSumOf(cells, (cell) => cell.expected * (1 - cell.loaded)),
    falsePositives: bitSumOf(cells, (cell) => (1 - cell.expected) * cell.loaded),
    trueNegatives: bitSumOf(cells, (cell) => (1 - cell.expected) * (1 - cell.loaded)),
  })

const positivesOf = (cells: ReadonlyArray<RoutingCell>): number => cells.filter((cell) => cell.expected === 1).length

const negativesOf = (cells: ReadonlyArray<RoutingCell>): number => cells.filter((cell) => cell.expected === 0).length

const positiveOutcomesOf = (cells: ReadonlyArray<RoutingCell>): ReadonlyArray<Bit> =>
  cells.filter((cell) => cell.expected === 1).map((cell) => cell.loaded)

const negativeOutcomesOf = (cells: ReadonlyArray<RoutingCell>): ReadonlyArray<Bit> =>
  cells.filter((cell) => cell.expected === 0).map((cell) => invertedBitOf(cell.loaded))

/**
 * A split carries rate-bearing evidence when both classes clear the configured
 * floor and hold at least one labelled cell each, so a scored row never hands
 * the interval workflow a one-class or empty outcome vector.
 */
const carriesEvidence = (cells: ReadonlyArray<RoutingCell>, floor: EvidenceFloor): boolean =>
  Arr.every(
    [
      positivesOf(cells) >= Num.max(floor.positives, 1),
      negativesOf(cells) >= Num.max(floor.negatives, 1),
    ],
    (holds) => holds,
  )

const rowWithEvidenceOf = (
  packId: string,
  stem: string,
  split: TaskSplit,
  splitCells: ReadonlyArray<RoutingCell>,
  floor: EvidenceFloor,
): RuleRouting =>
  Match.value(carriesEvidence(splitCells, floor)).pipe(
    Match.when(true, () =>
      new RoutingScored({
        packId,
        stem,
        split,
        counts: countsOf(splitCells),
        positiveOutcomes: positiveOutcomesOf(splitCells),
        negativeOutcomes: negativeOutcomesOf(splitCells),
      })),
    Match.when(false, () => new RoutingInsufficientEvidence({ packId, stem, split, counts: countsOf(splitCells) })),
    Match.exhaustive,
  )

const rowOf = (
  packId: string,
  stem: string,
  split: TaskSplit,
  ruleCells: ReadonlyArray<RoutingCell>,
  splitCells: ReadonlyArray<RoutingCell>,
  floor: EvidenceFloor,
): RuleRouting =>
  Match.value(ruleCells.length === 0).pipe(
    Match.when(true, () => new RoutingUnlabelled({ packId, stem, split, counts: countsOf(splitCells) })),
    Match.when(false, () => rowWithEvidenceOf(packId, stem, split, splitCells, floor)),
    Match.exhaustive,
  )

const sameRule = (packId: string, stem: string) => (cell: RoutingCell): boolean =>
  Arr.every([cell.packId === packId, cell.stem === stem], (holds) => holds)

const rowsOfRule = (
  cells: ReadonlyArray<RoutingCell>,
  packId: string,
  stem: string,
  floor: EvidenceFloor,
): ReadonlyArray<RuleRouting> => {
  const ruleCells = cells.filter(sameRule(packId, stem))
  return SPLITS.map((split) => {
    const splitCells = ruleCells.filter((cell) => cell.split === split)
    return rowOf(packId, stem, split, ruleCells, splitCells, floor)
  })
}

const routingRowsOf = (command: ScoreRuleRoutingCommand): ReadonlyArray<RuleRouting> => {
  const cells = cellsOf(command)
  const floor = Option.fromUndefinedOr(command.evidenceFloor).pipe(Option.getOrElse(() => DEFAULT_FLOOR))
  return command.packs.flatMap((pack) => pack.rules.flatMap((rule) => rowsOfRule(cells, pack.id, rule.stem, floor)))
}

const decide = (command: ScoreRuleRoutingCommand): Result.Result<ScoreRuleRoutingDecision, never> =>
  Result.succeed(routingRowsOf(command))

export const scoreRuleRouting = Workflow.make({
  command: ScoreRuleRoutingCommand,
  decision: ScoreRuleRoutingDecision,
  error: Schema.Never,
  decide,
})
