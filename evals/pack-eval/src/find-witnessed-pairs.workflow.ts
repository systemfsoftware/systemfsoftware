import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Array as Arr, Option, Order, Result, Schema } from 'effect'
import type { RoutingLabelEntry } from './labels.schema.js'
import { RoutingLabels } from './labels.schema.js'

const FindWitnessedPairsTypeId: unique symbol = Symbol.for('@systemfsoftware/pack-eval/FindWitnessedPairs')
type FindWitnessedPairsTypeId = typeof FindWitnessedPairsTypeId

export class PackStems extends Schema.Class<PackStems>('PackStems')({
  packId: Schema.NonEmptyString,
  stems: Schema.Array(Schema.NonEmptyString),
}) {}

export class WitnessedPair extends Schema.TaggedClass<WitnessedPair>()('WitnessedPair', {
  ruleA: Schema.NonEmptyString,
  ruleB: Schema.NonEmptyString,
  taskIds: Schema.Array(Schema.NonEmptyString),
}) {}

export class UnwitnessedPair extends Schema.TaggedClass<UnwitnessedPair>()('UnwitnessedPair', {
  ruleA: Schema.NonEmptyString,
  ruleB: Schema.NonEmptyString,
}) {}

export const PairWitness = Schema.Union([WitnessedPair, UnwitnessedPair])
export type PairWitness = typeof PairWitness.Type

export class PackPairWitness extends Schema.Class<PackPairWitness>('PackPairWitness')({
  packId: Schema.NonEmptyString,
  pairs: Schema.Array(PairWitness),
}) {}

export class WitnessedPairsListed extends Schema.TaggedClass<WitnessedPairsListed>()('WitnessedPairsListed', {
  packs: Schema.Array(PackPairWitness),
}) {
  readonly [FindWitnessedPairsTypeId] = FindWitnessedPairsTypeId
}

export class WitnessedPairsRefused extends Schema.TaggedClass<WitnessedPairsRefused>()('WitnessedPairsRefused', {
  reason: Schema.NonEmptyString,
}) {
  readonly [FindWitnessedPairsTypeId] = FindWitnessedPairsTypeId
}

export const FindWitnessedPairsDecision = Schema.Union([WitnessedPairsListed, WitnessedPairsRefused])
export type FindWitnessedPairsDecision = typeof FindWitnessedPairsDecision.Type

export class FindWitnessedPairsCommand extends Schema.Class<FindWitnessedPairsCommand>('FindWitnessedPairsCommand')({
  packs: Schema.Array(PackStems),
  routingLabels: RoutingLabels,
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

const distinctSortedStemsOf = (pack: PackStems): ReadonlyArray<string> => Arr.sort(Order.String)(Arr.dedupe(pack.stems))

const tailsOf = (rules: ReadonlyArray<string>): ReadonlyArray<readonly [string, string]> =>
  Arr.flatMap(rules, (ruleA, index) => rules.slice(index + 1).map((ruleB) => [ruleA, ruleB] as const))

const ascendingOf = (left: string, right: string): number => Number(left > right) - Number(left < right)

const taskEntryMatches = (
  entry: RoutingLabelEntry,
  packId: string,
  taskId: string,
): boolean => Arr.every([entry.packId === packId, entry.taskId === taskId], (holds) => holds)

const taskEntriesOf = (
  entries: ReadonlyArray<RoutingLabelEntry>,
  packId: string,
  taskId: string,
): ReadonlyArray<RoutingLabelEntry> => entries.filter((entry) => taskEntryMatches(entry, packId, taskId))

const governedStemsOf = (
  entries: ReadonlyArray<RoutingLabelEntry>,
  packId: string,
  taskId: string,
): ReadonlyArray<string> => taskEntriesOf(entries, packId, taskId).flatMap((entry) => entry.governing)

const mentionsBothOf = (
  stems: ReadonlyArray<string>,
  ruleA: string,
  ruleB: string,
): boolean => Arr.every([stems.includes(ruleA), stems.includes(ruleB)], (holds) => holds)

const dualGoverningOf = (
  entries: ReadonlyArray<RoutingLabelEntry>,
  packId: string,
  taskId: string,
  ruleA: string,
  ruleB: string,
): boolean => mentionsBothOf(governedStemsOf(entries, packId, taskId), ruleA, ruleB)

const sharedTasksOf = (
  entries: ReadonlyArray<RoutingLabelEntry>,
  packId: string,
  ruleA: string,
  ruleB: string,
): ReadonlyArray<string> =>
  Arr.dedupe(
    entries
      .filter((entry) => entry.packId === packId)
      .map((entry) => entry.taskId)
      .filter((taskId) => dualGoverningOf(entries, packId, taskId, ruleA, ruleB)),
  ).toSorted(ascendingOf)

const pairWitnessOf = (
  entries: ReadonlyArray<RoutingLabelEntry>,
  packId: string,
  ruleA: string,
  ruleB: string,
): PairWitness =>
  Option.match(
    Option.flatten(Option.fromUndefinedOr(Arr.get(sharedTasksOf(entries, packId, ruleA, ruleB), 0))),
    {
      onNone: () => new UnwitnessedPair({ ruleA, ruleB }),
      onSome: () => new WitnessedPair({ ruleA, ruleB, taskIds: sharedTasksOf(entries, packId, ruleA, ruleB) }),
    },
  )

const packWitnessOf = (
  command: FindWitnessedPairsCommand,
  pack: PackStems,
): PackPairWitness =>
  new PackPairWitness({
    packId: pack.packId,
    pairs: tailsOf(distinctSortedStemsOf(pack)).map(([ruleA, ruleB]) =>
      pairWitnessOf(command.routingLabels.entries, pack.packId, ruleA, ruleB)
    ),
  })

const unknownStemOf = (names: ReadonlyArray<string>, pack: PackStems): Option.Option<string> =>
  Arr.findFirst(names, (stem) => pack.stems.includes(stem) === false)

const stemsOf = (entry: RoutingLabelEntry): ReadonlyArray<string> => [...entry.governing, ...entry.deferred]

const unknownInEntryOf = (
  entries: ReadonlyArray<RoutingLabelEntry>,
  pack: PackStems,
): Option.Option<{ readonly entry: RoutingLabelEntry; readonly stem: string }> =>
  Arr.findFirst(entries, (entry) =>
    Arr.every(
      [entry.packId === pack.packId, Option.isSome(unknownStemOf(stemsOf(entry), pack))],
      (holds) => holds,
    )).pipe(
      Option.flatMap((entry) => Option.map(unknownStemOf(stemsOf(entry), pack), (stem) => ({ entry, stem }))),
    )

const refusedOf = (
  command: FindWitnessedPairsCommand,
): Option.Option<WitnessedPairsRefused> => {
  const found = Arr.findFirst(
    command.packs,
    (pack) => Option.isSome(unknownInEntryOf(command.routingLabels.entries, pack)),
  )
  return Option.flatMap(
    found,
    (pack) =>
      Option.map(
        unknownInEntryOf(command.routingLabels.entries, pack),
        (unknown) =>
          new WitnessedPairsRefused({
            reason: `label task '${unknown.entry.taskId}' names stem '${unknown.stem}' outside pack '${pack.packId}'`,
          }),
      ),
  )
}

const listedOf = (command: FindWitnessedPairsCommand): WitnessedPairsListed =>
  new WitnessedPairsListed({
    packs: command.packs.map((pack) => packWitnessOf(command, pack)),
  })

const decide = (command: FindWitnessedPairsCommand): Result.Result<FindWitnessedPairsDecision, never> =>
  Option.match(refusedOf(command), {
    onNone: () => Result.succeed(listedOf(command)),
    onSome: (refused) => Result.succeed(refused),
  })

export const findWitnessedPairs = Workflow.make({
  command: FindWitnessedPairsCommand,
  decision: FindWitnessedPairsDecision,
  error: Schema.Never,
  decide,
})
