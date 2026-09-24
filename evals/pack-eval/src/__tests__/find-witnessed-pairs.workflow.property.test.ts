import { it } from '@effect/vitest'
import { Match, Result, Schema } from 'effect'
import type { FindWitnessedPairsDecision, PairWitness } from '../find-witnessed-pairs.workflow.js'
import {
  findWitnessedPairs,
  FindWitnessedPairsCommand,
  PackStems,
  UnwitnessedPair,
  WitnessedPair,
} from '../find-witnessed-pairs.workflow.js'
import { RoutingLabelEntry, RoutingLabels } from '../labels.schema.js'

const trialsOf = (count: number): number => 1 + (Math.abs(count) % 4)

const stemsOf = (count: number, owner: string): ReadonlyArray<string> =>
  Array.from({ length: count }, (_, index) => `${owner}-${index}`)

const commandOf = (
  packCount: number,
  stemCount: number,
  extraStems: number,
  taskCount: number,
): FindWitnessedPairsCommand => {
  const stemTotal = 1 + (Math.abs(stemCount) % 4)
  const packs = Array.from({ length: trialsOf(packCount) }, (_, packIndex) => {
    const packId = `pack-${packIndex}`
    return new PackStems({
      packId,
      stems: [
        ...stemsOf(stemTotal, packId),
        ...stemsOf(Math.abs(extraStems) % 3, packId),
      ],
    })
  })
  const entries = packs.flatMap((pack) =>
    Array.from({ length: trialsOf(taskCount) }, (_, taskIndex) => {
      const governing = pack.stems.filter((_, stemIndex) => (stemIndex + taskIndex) % 2 === 0)
      return new RoutingLabelEntry({
        taskId: `task-${taskIndex}`,
        packId: pack.packId,
        governing,
        deferred: [],
      })
    })
  )
  return new FindWitnessedPairsCommand({
    packs,
    routingLabels: new RoutingLabels({ version: 1, entries }),
  })
}

const decisionOf = (command: FindWitnessedPairsCommand): FindWitnessedPairsDecision =>
  Result.getOrThrow(findWitnessedPairs(command))

const packsOf = (command: FindWitnessedPairsCommand): ReadonlyArray<PackStems> => command.packs

const pairsOf = (command: FindWitnessedPairsCommand, packId: string): ReadonlyArray<PairWitness> =>
  Match.value(decisionOf(command)).pipe(
    Match.tag(
      'WitnessedPairsListed',
      (listed) => (listed.packs.find((pack) => pack.packId === packId) ?? { pairs: [] }).pairs,
    ),
    Match.tag('WitnessedPairsRefused', () => []),
    Match.exhaustive,
  )

const witnessedByHand = (
  entries: ReadonlyArray<RoutingLabelEntry>,
  packId: string,
  ruleA: string,
  ruleB: string,
): ReadonlyArray<string> => {
  const taskIds = entries
    .filter((entry) => entry.packId === packId)
    .map((entry) => entry.taskId)
  const distinct = [...new Set(taskIds)].sort((left, right) => Number(left > right) - Number(left < right))
  return distinct.filter((taskId) =>
    entries.some(
      (entry) =>
        entry.packId === packId && entry.taskId === taskId && entry.governing.includes(ruleA) &&
        entries.some((other) => other.packId === packId && other.taskId === taskId && other.governing.includes(ruleB)),
    )
  )
}

it.prop(
  '∀p_PairEnumeration_≡TriangleWithoutSelfPairs',
  [Schema.Int, Schema.Int, Schema.Int, Schema.Int],
  ([packDraw, stemDraw, extraDraw, taskDraw]) => {
    const command = commandOf(packDraw, stemDraw, extraDraw, taskDraw)
    return packsOf(command).every((pack) => {
      const distinct = [...new Set(pack.stems)]
      const pairs = pairsOf(command, pack.packId)
      const expected = (distinct.length * (distinct.length - 1)) / 2
      return pairs.length === expected &&
        pairs.every((pair) =>
          Match.value(pair).pipe(
            Match.tag('WitnessedPair', (witnessed) => witnessed.ruleA < witnessed.ruleB),
            Match.tag('UnwitnessedPair', (unwitnessed) => unwitnessed.ruleA < unwitnessed.ruleB),
            Match.exhaustive,
          )
        )
    })
  },
)

it.prop(
  '∀p_UnlabeledPair_≡NeverWitnessed',
  [Schema.Int, Schema.Int, Schema.Int, Schema.Int],
  ([packDraw, stemDraw, extraDraw, taskDraw]) => {
    const command = commandOf(packDraw, stemDraw, extraDraw, taskDraw)
    return packsOf(command).every((pack) =>
      pairsOf(command, pack.packId).every((pair) =>
        Match.value(pair).pipe(
          Match.tag(
            'WitnessedPair',
            (witnessed) =>
              witnessedByHand(command.routingLabels.entries, pack.packId, witnessed.ruleA, witnessed.ruleB).length >
                0,
          ),
          Match.tag(
            'UnwitnessedPair',
            (unwitnessed) =>
              witnessedByHand(command.routingLabels.entries, pack.packId, unwitnessed.ruleA, unwitnessed.ruleB)
                .length ===
                0,
          ),
          Match.exhaustive,
        )
      )
    )
  },
)
it.prop(
  '∀p_LabelOutsidePack_≡UnwitnessedWithoutJudgeCall',
  [Schema.Int, Schema.Int, Schema.Int, Schema.Int],
  ([packDraw, stemDraw, extraDraw, taskDraw]) => {
    const command = commandOf(packDraw, stemDraw, extraDraw, taskDraw)
    return packsOf(command).every((pack) => {
      const pairs = pairsOf(command, pack.packId)
      const stems = new Set(pack.stems)
      return pairs.every((pair) => stems.has(pair.ruleA) && stems.has(pair.ruleB))
    })
  },
)

it.prop(
  '∀p_AbsentLabelStem_≡RefusedNamingPackAndStem',
  [Schema.Int, Schema.Int, Schema.Int, Schema.Int],
  ([packDraw, stemDraw, extraDraw, taskDraw]) => {
    const command = commandOf(packDraw, stemDraw, extraDraw, taskDraw)
    const pack = packsOf(command)[0]
    if (pack === undefined) return false
    const absentStem = `absent-${pack.packId}`
    const broken = new FindWitnessedPairsCommand({
      packs: command.packs,
      routingLabels: new RoutingLabels({
        version: 1,
        entries: [
          ...command.routingLabels.entries,
          new RoutingLabelEntry({
            taskId: 'task-orphan',
            packId: pack.packId,
            governing: [absentStem],
            deferred: [],
          }),
        ],
      }),
    })
    return Match.value(decisionOf(broken)).pipe(
      Match.tag(
        'WitnessedPairsRefused',
        (refused) =>
          refused.reason.includes(pack.packId) &&
          refused.reason.includes(absentStem) &&
          refused.reason.includes('task-orphan'),
      ),
      Match.tag('WitnessedPairsListed', () => false),
      Match.exhaustive,
    )
  },
)

it.prop(
  '∀p_OneStemPack_≡NoPairs',
  [Schema.Int, Schema.Int, Schema.Int],
  ([stemDraw, taskDraw, packDraw]) => {
    const command = commandOf(packDraw, stemDraw, 0, taskDraw)
    const single = new PackStems({ packId: 'pack-single', stems: ['only-stem'] })
    const lone = new FindWitnessedPairsCommand({
      packs: [single],
      routingLabels: command.routingLabels,
    })
    return pairsOf(lone, 'pack-single').length === 0 &&
      Schema.is(UnwitnessedPair)(new UnwitnessedPair({ ruleA: 'a', ruleB: 'b' })) &&
      Schema.is(WitnessedPair)(new WitnessedPair({ ruleA: 'a', ruleB: 'b', taskIds: ['t'] }))
  },
)
