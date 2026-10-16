/**
 * Partitions dehydrated atom values by whether the registry already holds their
 * key, so React can hydrate new atoms during render and defer existing ones to
 * commit.
 *
 * @since 4.0.0
 */
import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Array as Arr, HashSet, Match, Schema } from 'effect'
import * as Result from 'effect/Result'

const PartitionHydratedAtomsDecisionTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/effect-atom-react/PartitionHydratedAtoms',
)
type PartitionHydratedAtomsDecisionTypeId = typeof PartitionHydratedAtomsDecisionTypeId

export class HydrateDuringRender extends Schema.TaggedClass<HydrateDuringRender>()('HydrateDuringRender', {
  key: Schema.String,
}) {
  readonly [PartitionHydratedAtomsDecisionTypeId] = PartitionHydratedAtomsDecisionTypeId
}

export class DeferUntilCommit extends Schema.TaggedClass<DeferUntilCommit>()('DeferUntilCommit', {
  key: Schema.String,
}) {
  readonly [PartitionHydratedAtomsDecisionTypeId] = PartitionHydratedAtomsDecisionTypeId
}

export const PartitionHydratedAtomsDecision = Schema.Array(
  Schema.Union([HydrateDuringRender, DeferUntilCommit]),
)
export type PartitionHydratedAtomsDecision = typeof PartitionHydratedAtomsDecision.Type

export class PartitionHydratedAtoms extends Schema.TaggedClass<PartitionHydratedAtoms>()('PartitionHydratedAtoms', {
  knownKeys: Schema.Array(Schema.String),
  dehydratedKeys: Schema.Array(Schema.String),
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

export const partitionHydratedAtoms = Workflow.make({
  command: PartitionHydratedAtoms,
  decision: PartitionHydratedAtomsDecision,
  error: Schema.Never,
  decide: (command): Result.Result<PartitionHydratedAtomsDecision, never> => {
    const known = HashSet.fromIterable(command.knownKeys)
    return Result.succeed(
      Arr.map(
        command.dehydratedKeys,
        (key): PartitionHydratedAtomsDecision[number] =>
          Match.value(HashSet.has(known, key)).pipe(
            Match.when(
              true,
              (): PartitionHydratedAtomsDecision[number] => DeferUntilCommit.make({ key }),
            ),
            Match.when(
              false,
              (): PartitionHydratedAtomsDecision[number] => HydrateDuringRender.make({ key }),
            ),
            Match.exhaustive,
          ),
      ),
    )
  },
})
