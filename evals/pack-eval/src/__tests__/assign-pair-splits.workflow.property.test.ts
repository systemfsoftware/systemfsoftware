import { it } from '@effect/vitest'
import { Equal, Match, Result, Schema } from 'effect'
import {
  assignPairSplits,
  AssignPairSplitsCommand,
  type AssignPairSplitsDecision,
  PairSplit,
  PairSplitInput,
} from '../assign-pair-splits.workflow.js'

const trialsIn = (draw: number): number => 1 + draw

const passPairAt = (index: number): PairSplitInput =>
  new PairSplitInput({ pairId: `pass-pair-${index}`, verdict: 'Pass' })

const failPairAt = (index: number): PairSplitInput =>
  new PairSplitInput({ pairId: `fail-pair-${index}`, verdict: 'Fail' })

const pairsOf = (
  passDraw: number,
  failDraw: number,
  fewShareDraw: number,
): { readonly pairs: ReadonlyArray<PairSplitInput>; readonly fewShotPairIds: ReadonlyArray<string> } => {
  const passPairs = Array.from({ length: trialsIn(passDraw) }, (_, index) => passPairAt(index))
  const failPairs = Array.from({ length: trialsIn(failDraw) }, (_, index) => failPairAt(index))
  const pairs = [...passPairs, ...failPairs]
  const fewShotPairIds = pairs
    .filter((_, index) => index <= fewShareDraw)
    .map((pair) => pair.pairId)
  return { pairs, fewShotPairIds }
}

const commandOf = (
  passDraw: number,
  failDraw: number,
  fewShareDraw: number,
): AssignPairSplitsCommand => {
  const { pairs, fewShotPairIds } = pairsOf(passDraw, failDraw, fewShareDraw)
  return new AssignPairSplitsCommand({ pairs, fewShotPairIds })
}

const decisionsOf = (command: AssignPairSplitsCommand): AssignPairSplitsDecision =>
  Result.getOrThrow(assignPairSplits(command))

const assignmentsOf = (
  decision: AssignPairSplitsDecision,
): ReadonlyArray<{ readonly pairId: string; readonly split: PairSplit }> =>
  Match.value(decision).pipe(
    Match.tag('PairsApportioned', (apportioned) => [...apportioned.assignments]),
    Match.tag('PairsBelowThreshold', (below) => [...below.assignments]),
    Match.exhaustive,
  )

const splitOf = (decision: AssignPairSplitsDecision, pairId: string): PairSplit | undefined =>
  assignmentsOf(decision).find((assignment) => assignment.pairId === pairId)?.split

const splitsFor = (
  decision: AssignPairSplitsDecision,
  verdict: 'Pass' | 'Fail',
  pairs: ReadonlyArray<PairSplitInput>,
): ReadonlyArray<PairSplit | undefined> =>
  pairs.filter((pair) => pair.verdict === verdict).map((pair) => splitOf(decision, pair.pairId))

it.prop(
  '∀s_pairSet_≡DeterministicAssignment',
  [
    Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: 7 }))),
    Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: 7 }))),
    Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: 7 }))),
  ],
  ([passDraw, failDraw, fewShareDraw]) => {
    const command = commandOf(passDraw, failDraw, fewShareDraw)
    const first = decisionsOf(command)
    const again = decisionsOf(commandOf(passDraw, failDraw, fewShareDraw))
    return Equal.equals(first, again)
  },
)

it.prop(
  '∀s_thresholdBreachedOnBothClasses_≡PairsApportioned',
  [
    Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 3, maximum: 8 }))),
    Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 3, maximum: 8 }))),
    Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: -3, maximum: -1 }))),
  ],
  ([passDraw, failDraw, fewShareDraw]) => {
    const { pairs, fewShotPairIds } = pairsOf(passDraw, failDraw, fewShareDraw)
    const decision = decisionsOf(new AssignPairSplitsCommand({ pairs, fewShotPairIds }))
    const beyondTrain = (verdict: 'Pass' | 'Fail'): ReadonlyArray<PairSplit | undefined> =>
      splitsFor(decision, verdict, pairs).filter((split) => split !== 'train')
    const verdicts: ReadonlyArray<'Pass' | 'Fail'> = ['Pass', 'Fail']
    const splits: ReadonlyArray<PairSplit> = ['dev', 'test']
    return verdicts.every((verdict) =>
      splits.every((split) => beyondTrain(verdict).filter((found) => found === split).length >= 1)
    )
  },
)
it.prop(
  '∀s_fewShotPair_≡AlwaysTrain',
  [
    Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: 7 }))),
    Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: 7 }))),
    Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: 7 }))),
  ],
  ([passDraw, failDraw, fewShareDraw]) => {
    const { pairs, fewShotPairIds } = pairsOf(passDraw, failDraw, fewShareDraw)
    const decision = decisionsOf(new AssignPairSplitsCommand({ pairs, fewShotPairIds }))
    return Match.value(decision).pipe(
      Match.tag('PairsApportioned', () => fewShotPairIds.every((pairId) => splitOf(decision, pairId) === 'train')),
      Match.tag('PairsBelowThreshold', () => fewShotPairIds.every((pairId) => splitOf(decision, pairId) === 'train')),
      Match.exhaustive,
    )
  },
)

it.prop(
  '∀s_classBelowThreshold_≡RemainderToDev',
  [
    Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: 1 }))),
    Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: 1 }))),
    Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: -3, maximum: -1 }))),
  ],
  ([passDraw, failDraw, fewShareDraw]) => {
    const { pairs, fewShotPairIds } = pairsOf(passDraw, failDraw, fewShareDraw)
    const decision = decisionsOf(new AssignPairSplitsCommand({ pairs, fewShotPairIds }))
    return pairs.every((pair) =>
      fewShotPairIds.includes(pair.pairId)
        ? splitOf(decision, pair.pairId) === 'train'
        : splitOf(decision, pair.pairId) === 'dev'
    )
  },
)
