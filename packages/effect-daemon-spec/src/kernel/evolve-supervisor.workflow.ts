import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Result, Schema } from 'effect'
import { SupervisionDecision } from './interpret-supervision-event.workflow.js'
import { PositiveMillis } from './SupervisionLimits.schema.js'
import { StateTypeId } from './SupervisionTypeIds.js'
import { ChildStart, SupervisorCore } from './SupervisorState.schema.js'
import { SupervisorExit, TerminationReason } from './TerminationReport.schema.js'

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

export class SupervisionEvolution extends Schema.TaggedClass<SupervisionEvolution>()('SupervisionEvolution', {
  state: SupervisorState,
  decision: SupervisionDecision,
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

const withCore = (state: SupervisorState, core: SupervisorCore): SupervisorState =>
  Match.value(state).pipe(
    Match.tag('Running', () => new Running({ core })),
    Match.tag('Restarting', (restarting) => new Restarting({ core, pending: restarting.pending })),
    Match.tag('CoolingDown', (cooling) => new CoolingDown({ core, millis: cooling.millis })),
    Match.tag('ShuttingDown', (shutting) => new ShuttingDown({ core, reason: shutting.reason, exit: shutting.exit })),
    Match.tag('Terminated', (terminated) => new Terminated({ reason: terminated.reason })),
    Match.exhaustive,
  )

const evolved = (state: SupervisorState, decision: SupervisionDecision): SupervisorState =>
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
  )

export const evolveSupervisor = Workflow.make({
  command: SupervisionEvolution,
  decision: SupervisorState,
  error: Schema.Never,
  decide: (step): Result.Result<SupervisorState, never> => Result.succeed(evolved(step.state, step.decision)),
})
