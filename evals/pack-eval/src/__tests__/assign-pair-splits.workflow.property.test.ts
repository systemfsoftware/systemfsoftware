import { it } from '@effect/vitest'
import { Equal, Match, Result, Schema } from 'effect'
import {
  assignPairSplits,
  AssignPairSplitsCommand,
  type AssignPairSplitsDecision,
  PairSplitInput,
} from '../assign-pair-splits.workflow.js'

const SPLITS = ['train', 'dev', 'test'] as const

type Pair = { readonly pairId: string; readonly verdict: 'Pass' | 'Fail' }

const VERDICTS: ReadonlyArray<Pair['verdict']> = ['Pass', 'Fail']

const passPairOf = (index: number): Pair => ({ pairId: `pass-${index}`, verdict: 'Pass' })

const failPairOf = (index: number): Pair => ({ pairId: `fail-${index}`, verdict: 'Fail' })

const pairsOf = (passCount: number, failCount: number): ReadonlyArray<Pair> => [
  ...Array.from({ length: passCount }, (_, index) => passPairOf(index)),
  ...Array.from({ length: failCount }, (_, index) => failPairOf(index)),
]

const commandOf = (
  pairs: ReadonlyArray<Pair>,
  fewShotPairIds: ReadonlyArray<string> = [],
): AssignPairSplitsCommand =>
  new AssignPairSplitsCommand({
    pairs: pairs.map((pair) => new PairSplitInput({ pairId: pair.pairId, verdict: pair.verdict })),
    fewShotPairIds,
  })

const assignmentsOf = (
  decision: AssignPairSplitsDecision,
): ReadonlyArray<{ readonly pairId: string; readonly split: string }> =>
  Match.value(decision).pipe(
    Match.tag('PairsApportioned', (apportioned) => [...apportioned.assignments]),
    Match.tag('PairsBelowThreshold', (below) => [...below.assignments]),
    Match.exhaustive,
  )

const decisionOf = (command: AssignPairSplitsCommand): AssignPairSplitsDecision =>
  Result.getOrThrow(assignPairSplits(command))

const splitOf = (decision: AssignPairSplitsDecision, pairId: string): string | undefined =>
  assignmentsOf(decision).find((assignment) => assignment.pairId === pairId)?.split

const splitsFor = (decision: AssignPairSplitsDecision, verdict: Pair['verdict'], pairs: ReadonlyArray<Pair>) =>
  pairs
    .filter((pair) => pair.verdict === verdict)
    .map((pair) => splitOf(decision, pair.pairId))

const countOf = (splits: ReadonlyArray<string | undefined>, wanted: string): number =>
  splits.filter((split) => split === wanted).length

it.prop(
  '∀s_pairSet_≡DeterministicAssignment',
  [Schema.Int, Schema.Int, Schema.Int],
  ([passDraw, failDraw, fewDraw]) => {
    const pairs = pairsOf(1 + (Math.abs(passDraw) % 8), 1 + (Math.abs(failDraw) % 8))
    const fewShot = pairs.slice(0, Math.abs(fewDraw) % pairs.length).map((pair) => pair.pairId)
    const first = decisionOf(commandOf(pairs, fewShot))
    const again = decisionOf(commandOf(pairs, fewShot))
    return Equal.equals(first, again)
  },
)

it.prop(
  '∀s_eachClassAboveThreshold_≡BothVerdictsInDevAndTest',
  [Schema.Int, Schema.Int],
  ([passDraw, failDraw]) => {
    const pairs = pairsOf(3 + (Math.abs(passDraw) % 6), 3 + (Math.abs(failDraw) % 6))
    const decision = decisionOf(commandOf(pairs))
    return SPLITS.every((split) =>
      VERDICTS.every((verdict) => countOf(splitsFor(decision, verdict, pairs), split) >= 1)
    )
  },
)

it.prop(
  '∀s_fewShotPair_≡AlwaysTrain',
  [Schema.Int, Schema.Int, Schema.Int],
  ([passDraw, failDraw, fewDraw]) => {
    const pairs = pairsOf(1 + (Math.abs(passDraw) % 8), 1 + (Math.abs(failDraw) % 8))
    const fewShot = pairs.slice(0, Math.abs(fewDraw) % (pairs.length + 1)).map((pair) => pair.pairId)
    const decision = decisionOf(commandOf(pairs, fewShot))
    return fewShot.every((pairId) => splitOf(decision, pairId) === 'train')
  },
)

it.prop(
  '∀s_classBelowThreshold_≡RemainderToDev',
  [Schema.Int, Schema.Int, Schema.Int],
  ([passDraw, failDraw, fewDraw]) => {
    const pairs = pairsOf(Math.abs(passDraw) % 3, Math.abs(failDraw) % 3)
    const fewShot = pairs.slice(0, Math.abs(fewDraw) % (pairs.length + 1)).map((pair) => pair.pairId)
    const decision = decisionOf(commandOf(pairs, fewShot))
    return pairs.every((pair) =>
      fewShot.includes(pair.pairId)
        ? splitOf(decision, pair.pairId) === 'train'
        : splitOf(decision, pair.pairId) === 'dev'
    )
  },
)
