import { Schema } from 'effect'
import { ChildScript } from './ChildScript.schema.js'
import { ChildId } from './Trace.schema.js'

export const RestartStrategy = Schema.Literals(['one_for_one', 'one_for_all', 'rest_for_one'])
export type RestartStrategy = typeof RestartStrategy.Type

export const RestartType = Schema.Literals(['permanent', 'transient', 'temporary'])
export type RestartType = typeof RestartType.Type

export const ShutdownKind = Schema.Literals(['brutal', 'graceful', 'infinity'])
export type ShutdownKind = typeof ShutdownKind.Type

const Millis = Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 1, maximum: 60_000 })))
const Intensity = Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: 8 })))

/** One child of a scenario's tree: its identity, policy and script. */
export const ChildRole = Schema.Struct({
  childId: ChildId,
  restartType: RestartType,
  shutdown: ShutdownKind,
  startTimeoutMillis: Millis,
  script: ChildScript,
})
export type ChildRole = typeof ChildRole.Type

/** A scripted advance of one child's control channel. */
export const AdvanceChild = Schema.TaggedStruct('AdvanceChild', { childId: ChildId })
export type AdvanceChild = typeof AdvanceChild.Type

/** A scripted request to shut the supervisor down, so its stop modes are exercised. */
export const ShutdownSupervisor = Schema.TaggedStruct('ShutdownSupervisor', {})
export type ShutdownSupervisor = typeof ShutdownSupervisor.Type

export const ControlStep = Schema.Union([AdvanceChild, ShutdownSupervisor])
export type ControlStep = typeof ControlStep.Type

/**
 * A scenario is medium-independent: the shape of a supervision tree (strategy,
 * intensity, child roles) and the control sequence that drives its scripts. A
 * driver turns each role's script into its own program; the scenario never names
 * a medium implementation.
 */
export const Scenario = Schema.Struct({
  name: Schema.String,
  strategy: RestartStrategy,
  intensity: Intensity,
  periodMillis: Millis,
  children: Schema.Array(ChildRole),
  control: Schema.Array(ControlStep),
})
export type Scenario = typeof Scenario.Type
