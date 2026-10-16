import { Array as Arr, Match, Schema } from 'effect'
import { dual } from 'effect/Function'
import type { SupervisionDecision } from './interpret-supervision-event.workflow.js'
import {
  ChildId,
  EventTime,
  Generation,
  Ordinal,
  PositiveMillis,
  ProbeFailures,
  RestartCount,
} from './SupervisionLimits.schema.js'
import { SupervisionPolicy } from './SupervisorPolicy.schema.js'
import { SupervisorExit, TerminationReason } from './TerminationReport.schema.js'

const StateTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-daemon/SupervisorState')

export const ChildStatus = Schema.Literals(['starting', 'ready', 'stopping'])
export type ChildStatus = typeof ChildStatus.Type

export const ChildInstance = Schema.Struct({
  childId: ChildId,
  generation: Generation,
  status: ChildStatus,
  consecutiveRestarts: RestartCount,
  probeFailures: ProbeFailures,
})
export type ChildInstance = typeof ChildInstance.Type

export const SupervisorCore = Schema.Struct({
  policy: SupervisionPolicy,
  children: Schema.Array(ChildInstance),
  restartStamps: Schema.Array(EventTime),
  nextOrdinal: Ordinal,
})
export type SupervisorCore = typeof SupervisorCore.Type

export const ChildStart = Schema.Struct({ childId: ChildId, generation: Generation })
export type ChildStart = typeof ChildStart.Type

export class Running extends Schema.TaggedClass<Running>()('Running', { core: SupervisorCore }) {
  readonly [StateTypeId] = StateTypeId
}

export class Restarting extends Schema.TaggedClass<Restarting>()('Restarting', {
  core: SupervisorCore,
  pending: Schema.Array(ChildStart),
}) {
  readonly [StateTypeId] = StateTypeId
}

export class CoolingDown extends Schema.TaggedClass<CoolingDown>()('CoolingDown', {
  core: SupervisorCore,
  millis: PositiveMillis,
}) {
  readonly [StateTypeId] = StateTypeId
}

export class ShuttingDown extends Schema.TaggedClass<ShuttingDown>()('ShuttingDown', {
  core: SupervisorCore,
  reason: TerminationReason,
  exit: SupervisorExit,
}) {
  readonly [StateTypeId] = StateTypeId
}

export class Terminated extends Schema.TaggedClass<Terminated>()('Terminated', { reason: TerminationReason }) {
  readonly [StateTypeId] = StateTypeId
}

export const SupervisorState = Schema.Union([Running, Restarting, CoolingDown, ShuttingDown, Terminated])
export type SupervisorState = typeof SupervisorState.Type

export const initialStateOf = (policy: SupervisionPolicy): SupervisorCore => ({
  policy,
  children: Arr.map(policy.childDeclarations, (declaration) => ({
    childId: declaration.childId,
    generation: 0,
    status: 'starting',
    consecutiveRestarts: 0,
    probeFailures: 0,
  })),
  restartStamps: [],
  nextOrdinal: 0,
})

const withCore = (state: SupervisorState, core: SupervisorCore): SupervisorState =>
  Match.value(state).pipe(
    Match.tag('Running', () => new Running({ core })),
    Match.tag('Restarting', (restarting) => new Restarting({ core, pending: restarting.pending })),
    Match.tag('CoolingDown', (cooling) => new CoolingDown({ core, millis: cooling.millis })),
    Match.tag('ShuttingDown', (shutting) => new ShuttingDown({ core, reason: shutting.reason, exit: shutting.exit })),
    Match.tag('Terminated', (terminated) => new Terminated({ reason: terminated.reason })),
    Match.exhaustive,
  )

export const evolved: {
  (decision: SupervisionDecision): (state: SupervisorState) => SupervisorState
  (state: SupervisorState, decision: SupervisionDecision): SupervisorState
} = dual(
  2,
  (state: SupervisorState, decision: SupervisionDecision): SupervisorState =>
    Match.value(decision).pipe(
      Match.tag('Stale', () => state),
      Match.tag('RefuseDynamicStart', () => state),
      Match.tag('Continue', (continued) => withCore(state, continued.core)),
      Match.tag(
        'RestartChildren',
        (restarting) => new Restarting({ core: restarting.core, pending: restarting.pending }),
      ),
      Match.tag('StartChildren', (started) => new Running({ core: started.core })),
      Match.tag('CoolDown', (cooling) => new CoolingDown({ core: cooling.core, millis: cooling.millis })),
      Match.tag(
        'StopChildren',
        (stopping) => new ShuttingDown({ core: stopping.core, reason: stopping.reason, exit: stopping.exit }),
      ),
      Match.tag('Terminate', (terminated) => new Terminated({ reason: terminated.reason })),
      Match.exhaustive,
    ),
)
