import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Array as Arr, Option, Result, Schema } from 'effect'
import { JudgePrompt } from './judge-prompt.schema.js'
import type { PairLabel, RoutingLabelEntry } from './labels.schema.js'
import { PairLabels, RoutingLabels } from './labels.schema.js'
import { Pack } from './pack-rule.schema.js'
import { TaskSet } from './task-set.schema.js'

export class AdmitDataset extends Schema.Class<AdmitDataset>('AdmitDataset')({
  packs: Schema.Array(Pack),
  taskSet: TaskSet,
  routingLabels: RoutingLabels,
  pairLabels: Schema.optional(PairLabels),
  judgePrompt: Schema.optional(JudgePrompt),
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

const DatasetAdmittedTypeId: unique symbol = Symbol.for('@systemfsoftware/pack-eval/DatasetAdmitted')
type DatasetAdmittedTypeId = typeof DatasetAdmittedTypeId

export class DatasetAdmitted extends Schema.TaggedClass<DatasetAdmitted>()('DatasetAdmitted', {
  packs: Schema.Array(Pack),
  taskSet: TaskSet,
  routingLabels: RoutingLabels,
  pairLabels: Schema.optional(PairLabels),
  judgePrompt: Schema.optional(JudgePrompt),
}) {
  readonly [DatasetAdmittedTypeId] = DatasetAdmittedTypeId
}

export const AdmitDatasetDecision = Schema.Union([DatasetAdmitted])
export type AdmitDatasetDecision = typeof AdmitDatasetDecision.Type

export class DuplicateTaskId extends Schema.TaggedError<DuplicateTaskId>()('DuplicateTaskId', {
  taskId: Schema.NonEmptyString,
}) {}

export class DuplicatePairId extends Schema.TaggedError<DuplicatePairId>()('DuplicatePairId', {
  pairId: Schema.NonEmptyString,
}) {}

export class UnknownLabelTask extends Schema.TaggedError<UnknownLabelTask>()('UnknownLabelTask', {
  taskId: Schema.NonEmptyString,
}) {}

export class UnknownLabelPack extends Schema.TaggedError<UnknownLabelPack>()('UnknownLabelPack', {
  taskId: Schema.NonEmptyString,
  packId: Schema.NonEmptyString,
}) {}

export class UnknownRuleStem extends Schema.TaggedError<UnknownRuleStem>()('UnknownRuleStem', {
  taskId: Schema.NonEmptyString,
  packId: Schema.NonEmptyString,
  stem: Schema.NonEmptyString,
}) {}

export class UnknownPairTask extends Schema.TaggedError<UnknownPairTask>()('UnknownPairTask', {
  pairId: Schema.NonEmptyString,
  taskId: Schema.NonEmptyString,
}) {}

export class UnknownPairPack extends Schema.TaggedError<UnknownPairPack>()('UnknownPairPack', {
  pairId: Schema.NonEmptyString,
  packId: Schema.NonEmptyString,
}) {}

export class PairNotWitnessed extends Schema.TaggedError<PairNotWitnessed>()('PairNotWitnessed', {
  pairId: Schema.NonEmptyString,
  taskId: Schema.NonEmptyString,
  packId: Schema.NonEmptyString,
}) {}

export class FewShotPairNotInTrain extends Schema.TaggedError<FewShotPairNotInTrain>()('FewShotPairNotInTrain', {
  pairId: Schema.NonEmptyString,
}) {}

export const AdmitDatasetError = Schema.Union([
  DuplicateTaskId,
  DuplicatePairId,
  UnknownLabelTask,
  UnknownLabelPack,
  UnknownRuleStem,
  UnknownPairTask,
  UnknownPairPack,
  PairNotWitnessed,
  FewShotPairNotInTrain,
])
export type AdmitDatasetError = typeof AdmitDatasetError.Type

const admitted = (command: AdmitDataset): DatasetAdmitted =>
  new DatasetAdmitted({
    packs: command.packs,
    taskSet: command.taskSet,
    routingLabels: command.routingLabels,
    pairLabels: command.pairLabels,
    judgePrompt: command.judgePrompt,
  })

const firstDuplicate = (ids: ReadonlyArray<string>): Option.Option<string> =>
  Arr.findFirst(ids, (id, index) => ids.indexOf(id) !== index)

const refuseDuplicate = (
  ids: ReadonlyArray<string>,
  refusalOf: (id: string) => AdmitDatasetError,
): Result.Result<undefined, AdmitDatasetError> =>
  Option.match(firstDuplicate(ids), {
    onNone: () => Result.succeed(undefined),
    onSome: (id) => Result.fail(refusalOf(id)),
  })

const packById = (packs: ReadonlyArray<Pack>, packId: string): Option.Option<Pack> =>
  Arr.findFirst(packs, (pack) => pack.id === packId)

const refuseUnknownLabelTask = (
  taskIds: ReadonlyArray<string>,
  labels: RoutingLabels,
): Result.Result<undefined, AdmitDatasetError> =>
  Option.match(Arr.findFirst(labels.entries, (entry) => !taskIds.includes(entry.taskId)), {
    onNone: () => Result.succeed(undefined),
    onSome: (entry) => Result.fail(new UnknownLabelTask({ taskId: entry.taskId })),
  })

const refuseUnknownLabelPack = (
  packs: ReadonlyArray<Pack>,
  labels: RoutingLabels,
): Result.Result<undefined, AdmitDatasetError> =>
  Option.match(Arr.findFirst(labels.entries, (entry) => Option.isNone(packById(packs, entry.packId))), {
    onNone: () => Result.succeed(undefined),
    onSome: (entry) => Result.fail(new UnknownLabelPack({ taskId: entry.taskId, packId: entry.packId })),
  })

const unknownStemOf = (entry: RoutingLabelEntry, pack: Pack): Option.Option<UnknownRuleStem> =>
  Option.map(
    Arr.findFirst(
      [...entry.governing, ...entry.deferred],
      (stem) => !pack.rules.some((rule) => rule.stem === stem),
    ),
    (stem) => new UnknownRuleStem({ taskId: entry.taskId, packId: pack.id, stem }),
  )

const stemRefusalOf = (
  packs: ReadonlyArray<Pack>,
  entry: RoutingLabelEntry,
): Option.Option<UnknownRuleStem> => Option.flatMap(packById(packs, entry.packId), (pack) => unknownStemOf(entry, pack))

const refuseUnknownRuleStem = (
  packs: ReadonlyArray<Pack>,
  labels: RoutingLabels,
): Result.Result<undefined, AdmitDatasetError> =>
  Option.match(
    Arr.findFirst(labels.entries, (entry) => Option.isSome(stemRefusalOf(packs, entry))),
    {
      onNone: () => Result.succeed(undefined),
      onSome: (entry) =>
        Option.match(stemRefusalOf(packs, entry), {
          onNone: () => Result.succeed(undefined),
          onSome: (refusal) => Result.fail(refusal),
        }),
    },
  )

const refuseRoutingLabels = (
  command: AdmitDataset,
  taskIds: ReadonlyArray<string>,
): Result.Result<undefined, AdmitDatasetError> =>
  refuseUnknownLabelTask(taskIds, command.routingLabels).pipe(
    Result.flatMap(() => refuseUnknownLabelPack(command.packs, command.routingLabels)),
    Result.flatMap(() => refuseUnknownRuleStem(command.packs, command.routingLabels)),
  )

const governs = (entry: RoutingLabelEntry, stem: string): boolean => entry.governing.includes(stem)

const witnessedBy = (labels: RoutingLabels, pair: PairLabel): Option.Option<RoutingLabelEntry> =>
  Arr.findFirst(labels.entries, (entry) =>
    Arr.every(
      [
        entry.taskId === pair.taskId,
        entry.packId === pair.packId,
        governs(entry, pair.ruleA),
        governs(entry, pair.ruleB),
      ],
      (witnessed) => witnessed,
    ))

const refuseUnknownPairTask = (
  taskIds: ReadonlyArray<string>,
  pairLabels: PairLabels,
): Result.Result<undefined, AdmitDatasetError> =>
  Option.match(Arr.findFirst(pairLabels.entries, (entry) => !taskIds.includes(entry.taskId)), {
    onNone: () => Result.succeed(undefined),
    onSome: (entry) => Result.fail(new UnknownPairTask({ pairId: entry.id, taskId: entry.taskId })),
  })

const refuseUnknownPairPack = (
  packs: ReadonlyArray<Pack>,
  pairLabels: PairLabels,
): Result.Result<undefined, AdmitDatasetError> =>
  Option.match(Arr.findFirst(pairLabels.entries, (entry) => Option.isNone(packById(packs, entry.packId))), {
    onNone: () => Result.succeed(undefined),
    onSome: (entry) => Result.fail(new UnknownPairPack({ pairId: entry.id, packId: entry.packId })),
  })

const refuseUnwitnessedPairs = (
  labels: RoutingLabels,
  pairLabels: PairLabels,
): Result.Result<undefined, AdmitDatasetError> =>
  Option.match(Arr.findFirst(pairLabels.entries, (pair) => Option.isNone(witnessedBy(labels, pair))), {
    onNone: () => Result.succeed(undefined),
    onSome: (pair) => Result.fail(new PairNotWitnessed({ pairId: pair.id, taskId: pair.taskId, packId: pair.packId })),
  })

const refusePairEntries = (
  command: AdmitDataset,
  taskIds: ReadonlyArray<string>,
  pairLabels: PairLabels,
): Result.Result<undefined, AdmitDatasetError> =>
  refuseDuplicate(
    pairLabels.entries.map((entry) => entry.id),
    (pairId) => new DuplicatePairId({ pairId }),
  ).pipe(
    Result.flatMap(() => refuseUnknownPairTask(taskIds, pairLabels)),
    Result.flatMap(() => refuseUnknownPairPack(command.packs, pairLabels)),
    Result.flatMap(() => refuseUnwitnessedPairs(command.routingLabels, pairLabels)),
  )

const refuseOptionalPairs = (
  command: AdmitDataset,
  taskIds: ReadonlyArray<string>,
): Result.Result<undefined, AdmitDatasetError> =>
  Option.match(Option.fromUndefinedOr(command.pairLabels), {
    onNone: () => Result.succeed(undefined),
    onSome: (pairLabels) => refusePairEntries(command, taskIds, pairLabels),
  })

const trainPairIdsOf = (pairLabels: PairLabels): ReadonlyArray<string> =>
  pairLabels.entries.filter((entry) => entry.split === 'train').map((entry) => entry.id)

const refuseLeakedFewShotPair = (
  trainIds: ReadonlyArray<string>,
  judgePrompt: JudgePrompt,
): Result.Result<undefined, AdmitDatasetError> =>
  Option.match(Arr.findFirst(judgePrompt.fewShotPairIds, (id) => !trainIds.includes(id)), {
    onNone: () => Result.succeed(undefined),
    onSome: (pairId) => Result.fail(new FewShotPairNotInTrain({ pairId })),
  })

const noTrainPairIds = (): ReadonlyArray<string> => []

const refuseOptionalJudgePrompt = (command: AdmitDataset): Result.Result<undefined, AdmitDatasetError> =>
  Option.match(Option.fromUndefinedOr(command.judgePrompt), {
    onNone: () => Result.succeed(undefined),
    onSome: (judgePrompt) =>
      refuseLeakedFewShotPair(
        Option.match(Option.fromUndefinedOr(command.pairLabels), {
          onNone: noTrainPairIds,
          onSome: trainPairIdsOf,
        }),
        judgePrompt,
      ),
  })

const decide = (command: AdmitDataset): Result.Result<DatasetAdmitted, AdmitDatasetError> =>
  Result.gen(function*() {
    const taskIds = command.taskSet.tasks.map((task) => task.id)
    yield* refuseDuplicate(taskIds, (taskId) => new DuplicateTaskId({ taskId }))
    yield* refuseOptionalPairs(command, taskIds)
    yield* refuseRoutingLabels(command, taskIds)
    yield* refuseOptionalJudgePrompt(command)
    return admitted(command)
  })

export const admitDataset = Workflow.make({
  command: AdmitDataset,
  decision: AdmitDatasetDecision,
  error: AdmitDatasetError,
  decide,
})
