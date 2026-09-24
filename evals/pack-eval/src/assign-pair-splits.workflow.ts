import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Result, Schema } from 'effect'

/**
 * Stratified pair-split assignment at about 15/45/40.
 *
 * Each verdict class is handled on its own, ordered by pair id. A class is
 * apportioned into train/dev/test only once it holds at least
 * `SPLIT_MINIMUM` pairs — three, the fewest that can place one pair in each
 * split. Below that every new pair goes to `dev`, while a judge prompt
 * example stays in `train`. Within an apportioned class the judge prompt's
 * few-shot ids take the first train slots, so they never leave `train`.
 */
export class PairSplitInput extends Schema.Class<PairSplitInput>('PairSplitInput')({
  pairId: Schema.NonEmptyString,
  verdict: Schema.Literals(['Pass', 'Fail']),
}) {}

export class AssignPairSplitsCommand extends Schema.Class<AssignPairSplitsCommand>('AssignPairSplitsCommand')({
  pairs: Schema.Array(PairSplitInput),
  fewShotPairIds: Schema.Array(Schema.NonEmptyString),
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

export const PairSplit = Schema.Literals(['train', 'dev', 'test'])
export type PairSplit = typeof PairSplit.Type

export class PairSplitAssignment extends Schema.Class<PairSplitAssignment>('PairSplitAssignment')({
  pairId: Schema.NonEmptyString,
  split: PairSplit,
}) {}

const PairSplitsTypeId: unique symbol = Symbol.for('@systemfsoftware/pack-eval/PairSplits')
type PairSplitsTypeId = typeof PairSplitsTypeId

export class PairsApportioned extends Schema.TaggedClass<PairsApportioned>()('PairsApportioned', {
  assignments: Schema.Array(PairSplitAssignment),
}) {
  readonly [PairSplitsTypeId] = PairSplitsTypeId
}

export class PairsBelowThreshold extends Schema.TaggedClass<PairsBelowThreshold>()('PairsBelowThreshold', {
  assignments: Schema.Array(PairSplitAssignment),
}) {
  readonly [PairSplitsTypeId] = PairSplitsTypeId
}

export const AssignPairSplitsDecision = Schema.Union([PairsApportioned, PairsBelowThreshold])
export type AssignPairSplitsDecision = typeof AssignPairSplitsDecision.Type

const SPLIT_MINIMUM = 3

const TRAIN_SHARE_OF = 0.15

const DEV_SHARE_OF_REST = 45 / 85

const maxOf = (lower: number, upper: number): number =>
  Match.value(upper >= lower).pipe(
    Match.when(true, () => upper),
    Match.when(false, () => lower),
    Match.exhaustive,
  )

const wholeOf = (value: number): number => value - (value % 1)

const roundOf = (value: number): number =>
  Match.value(value % 1 >= 0.5).pipe(
    Match.when(true, () => wholeOf(value) + 1),
    Match.when(false, () => wholeOf(value)),
    Match.exhaustive,
  )

const trainCountOf = (total: number, fewCount: number): number =>
  maxOf(1, maxOf(fewCount, roundOf(total * TRAIN_SHARE_OF)))

const devCountOf = (rest: number): number =>
  Match.value(rest >= 2).pipe(
    Match.when(true, () => maxOf(1, roundOf(rest * DEV_SHARE_OF_REST))),
    Match.when(false, () => rest),
    Match.exhaustive,
  )

interface SplitCounts {
  readonly train: number
  readonly dev: number
  readonly test: number
}

const countsOf = (total: number, fewCount: number): SplitCounts => {
  const train = trainCountOf(total, fewCount)
  const rest = total - train
  const dev = devCountOf(rest)
  return { train, dev, test: rest - dev }
}

const splitAt = (counts: SplitCounts, index: number): PairSplit =>
  Match.value(index < counts.train).pipe(
    Match.when(true, (): PairSplit => 'train'),
    Match.when(false, () =>
      Match.value(index < counts.train + counts.dev).pipe(
        Match.when(true, (): PairSplit => 'dev'),
        Match.when(false, (): PairSplit => 'test'),
        Match.exhaustive,
      )),
    Match.exhaustive,
  )

const orderedBefore = (left: string, right: string): number =>
  Match.value(left === right).pipe(
    Match.when(true, () => 0),
    Match.when(false, () =>
      Match.value(left < right).pipe(
        Match.when(true, () => -1),
        Match.when(false, () => 1),
        Match.exhaustive,
      )),
    Match.exhaustive,
  )
const byPairId = (left: { readonly pairId: string }, right: { readonly pairId: string }): number =>
  orderedBefore(left.pairId, right.pairId)

const isFewShot = (fewShotPairIds: ReadonlyArray<string>, pair: PairSplitInput): boolean =>
  fewShotPairIds.includes(pair.pairId)

const apportionedOf = (
  ordered: ReadonlyArray<PairSplitInput>,
  counts: SplitCounts,
): ReadonlyArray<PairSplitAssignment> =>
  ordered.map((pair, index) => new PairSplitAssignment({ pairId: pair.pairId, split: splitAt(counts, index) }))

const belowThresholdOf = (
  ordered: ReadonlyArray<PairSplitInput>,
  fewShotPairIds: ReadonlyArray<string>,
): ReadonlyArray<PairSplitAssignment> =>
  ordered.map((pair) =>
    Match.value(isFewShot(fewShotPairIds, pair)).pipe(
      Match.when(true, () => new PairSplitAssignment({ pairId: pair.pairId, split: 'train' })),
      Match.when(false, () => new PairSplitAssignment({ pairId: pair.pairId, split: 'dev' })),
      Match.exhaustive,
    )
  )

const assignmentsOfClass = (
  pairs: ReadonlyArray<PairSplitInput>,
  fewShotPairIds: ReadonlyArray<string>,
): ReadonlyArray<PairSplitAssignment> => {
  const few = pairs.filter((pair) => isFewShot(fewShotPairIds, pair)).toSorted(byPairId)
  const rest = pairs.filter((pair) => !isFewShot(fewShotPairIds, pair)).toSorted(byPairId)
  const ordered = [...few, ...rest]
  return Match.value(pairs.length >= SPLIT_MINIMUM).pipe(
    Match.when(true, () => apportionedOf(ordered, countsOf(pairs.length, few.length))),
    Match.when(false, () => belowThresholdOf(ordered, fewShotPairIds)),
    Match.exhaustive,
  )
}

const assignmentsOf = (command: AssignPairSplitsCommand): ReadonlyArray<PairSplitAssignment> =>
  [
    ...assignmentsOfClass(command.pairs.filter((pair) => pair.verdict === 'Pass'), command.fewShotPairIds),
    ...assignmentsOfClass(command.pairs.filter((pair) => pair.verdict === 'Fail'), command.fewShotPairIds),
  ].toSorted(byPairId)

const decidedOf = (ordered: ReadonlyArray<PairSplitAssignment>, apportioned: boolean): AssignPairSplitsDecision =>
  Match.value(apportioned).pipe(
    Match.when(true, () => new PairsApportioned({ assignments: [...ordered] })),
    Match.when(false, () => new PairsBelowThreshold({ assignments: [...ordered] })),
    Match.exhaustive,
  )

const belowCountOf = (command: AssignPairSplitsCommand): number =>
  [command.pairs.filter((pair) => pair.verdict === 'Pass'), command.pairs.filter((pair) => pair.verdict === 'Fail')]
    .filter((classPairs) => classPairs.length < SPLIT_MINIMUM)
    .reduce((total, classPairs) => total + classPairs.length, 0)

const decide = (command: AssignPairSplitsCommand): Result.Result<AssignPairSplitsDecision, never> =>
  Result.succeed(decidedOf([...assignmentsOf(command)], belowCountOf(command) === 0))

export const assignPairSplits = Workflow.make({
  command: AssignPairSplitsCommand,
  decision: AssignPairSplitsDecision,
  error: Schema.Never,
  decide,
})
