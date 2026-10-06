import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Schema } from 'effect'
import * as Result from 'effect/Result'
import { NodePhase } from './node-phase.schema.js'

const NodeStateDecisionTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/effect-atom/NodeStateDecision',
)
type NodeStateDecisionTypeId = typeof NodeStateDecisionTypeId

export class BecomesValid extends Schema.TaggedClass<BecomesValid>()('BecomesValid', {}) {
  readonly [NodeStateDecisionTypeId] = NodeStateDecisionTypeId
}

export class BecomesStale extends Schema.TaggedClass<BecomesStale>()('BecomesStale', {}) {
  readonly [NodeStateDecisionTypeId] = NodeStateDecisionTypeId
}

export class BecomesChecking extends Schema.TaggedClass<BecomesChecking>()('BecomesChecking', {}) {
  readonly [NodeStateDecisionTypeId] = NodeStateDecisionTypeId
}

export class TakeBuiltValue extends Schema.TaggedClass<TakeBuiltValue>()('TakeBuiltValue', {}) {
  readonly [NodeStateDecisionTypeId] = NodeStateDecisionTypeId
}

export class KeepsPhase extends Schema.TaggedClass<KeepsPhase>()('KeepsPhase', {}) {
  readonly [NodeStateDecisionTypeId] = NodeStateDecisionTypeId
}

export const NodeStateDecision = Schema.Union([
  BecomesValid,
  BecomesStale,
  BecomesChecking,
  TakeBuiltValue,
  KeepsPhase,
])
export type NodeStateDecision = typeof NodeStateDecision.Type

export const NodeStateEvent = Schema.Literals([
  'settled',
  'invalidated',
  'descending',
  'restaled',
  'built',
])
export type NodeStateEvent = typeof NodeStateEvent.Type

export class AdvanceNodeState extends Schema.TaggedClass<AdvanceNodeState>()('AdvanceNodeState', {
  phase: NodePhase,
  event: NodeStateEvent,
  invalidatedDuringBuild: Schema.Boolean,
  preserveInitialValueOnBuild: Schema.Boolean,
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

const isCurrentPhase = (phase: NodePhase): boolean => ['valid', 'checking'].includes(phase)

const isWaitingPhase = (phase: NodePhase): boolean => ['uninitialized', 'stale'].includes(phase)

const settledVerdict = (phase: NodePhase): NodeStateDecision =>
  Match.value(phase === 'checking').pipe(
    Match.when(true, () => BecomesValid.make({})),
    Match.when(false, () => KeepsPhase.make({})),
    Match.exhaustive,
  )

const invalidatedVerdict = (phase: NodePhase): NodeStateDecision =>
  Match.value(isCurrentPhase(phase)).pipe(
    Match.when(true, () => BecomesStale.make({})),
    Match.when(false, () => KeepsPhase.make({})),
    Match.exhaustive,
  )

const descendingVerdict = (phase: NodePhase): NodeStateDecision =>
  Match.value(phase === 'valid').pipe(
    Match.when(true, () => BecomesChecking.make({})),
    Match.when(false, () => KeepsPhase.make({})),
    Match.exhaustive,
  )

const restaledVerdict = (phase: NodePhase, invalidatedDuringBuild: boolean): NodeStateDecision =>
  Match.value([phase === 'valid', invalidatedDuringBuild].includes(false)).pipe(
    Match.when(true, () => KeepsPhase.make({})),
    Match.when(false, () => BecomesStale.make({})),
    Match.exhaustive,
  )

const preservedOrTaken = (preserveInitialValueOnBuild: boolean): NodeStateDecision =>
  Match.value(preserveInitialValueOnBuild).pipe(
    Match.when(true, () => BecomesValid.make({})),
    Match.when(false, () => TakeBuiltValue.make({})),
    Match.exhaustive,
  )

const builtVerdict = (phase: NodePhase, preserveInitialValueOnBuild: boolean): NodeStateDecision =>
  Match.value(isWaitingPhase(phase)).pipe(
    Match.when(true, () => preservedOrTaken(preserveInitialValueOnBuild)),
    Match.when(false, () => KeepsPhase.make({})),
    Match.exhaustive,
  )

const eventVerdict = (command: AdvanceNodeState): NodeStateDecision =>
  Match.value(command.event).pipe(
    Match.when('settled', () => settledVerdict(command.phase)),
    Match.when('invalidated', () => invalidatedVerdict(command.phase)),
    Match.when('descending', () => descendingVerdict(command.phase)),
    Match.when('restaled', () => restaledVerdict(command.phase, command.invalidatedDuringBuild)),
    Match.when('built', () => builtVerdict(command.phase, command.preserveInitialValueOnBuild)),
    Match.exhaustive,
  )

export const advanceNodeState = Workflow.make({
  command: AdvanceNodeState,
  decision: NodeStateDecision,
  error: Schema.Never,
  decide: (command): Result.Result<NodeStateDecision, never> => Result.succeed(eventVerdict(command)),
})
