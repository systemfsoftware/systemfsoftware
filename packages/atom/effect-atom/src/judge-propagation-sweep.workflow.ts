import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Schema } from 'effect'
import * as Result from 'effect/Result'
import { NodePhase } from './node-phase.schema.js'

const PropagationSweepDecisionTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/effect-atom/PropagationSweepDecision',
)
type PropagationSweepDecisionTypeId = typeof PropagationSweepDecisionTypeId

export class ActOnMember extends Schema.TaggedClass<ActOnMember>()('ActOnMember', {}) {
  readonly [PropagationSweepDecisionTypeId] = PropagationSweepDecisionTypeId
}

export class SkipMember extends Schema.TaggedClass<SkipMember>()('SkipMember', {}) {
  readonly [PropagationSweepDecisionTypeId] = PropagationSweepDecisionTypeId
}

export const PropagationSweepDecision = Schema.Union([ActOnMember, SkipMember])
export type PropagationSweepDecision = typeof PropagationSweepDecision.Type

export const SweepKind = Schema.Literals(['invalidated-child', 'relinked-child', 'rebuilt-parent'])
export type SweepKind = typeof SweepKind.Type

export class SweepMember extends Schema.TaggedClass<SweepMember>()('SweepMember', {
  phase: NodePhase,
  sweep: SweepKind,
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

const continuesIntoChild = (phase: NodePhase): boolean => ['uninitialized', 'stale'].includes(phase)

const relinksChild = (phase: NodePhase): boolean => phase === 'stale'

const rebuildsParent = (phase: NodePhase): boolean => phase !== 'valid'

const acted = (command: SweepMember): boolean =>
  Match.value(command.sweep).pipe(
    Match.when('invalidated-child', () => continuesIntoChild(command.phase)),
    Match.when('relinked-child', () => relinksChild(command.phase)),
    Match.when('rebuilt-parent', () => rebuildsParent(command.phase)),
    Match.exhaustive,
  )

export const judgePropagationSweep = Workflow.make({
  command: SweepMember,
  decision: PropagationSweepDecision,
  error: Schema.Never,
  decide: (command): Result.Result<PropagationSweepDecision, never> =>
    Result.succeed(
      Match.value(acted(command)).pipe(
        Match.when(true, () => ActOnMember.make({})),
        Match.when(false, () => SkipMember.make({})),
        Match.exhaustive,
      ),
    ),
})
