import { Schema } from 'effect'
import { ChildId, EventTime, Generation, Ordinal, ProbeFailures, RestartCount } from './SupervisionLimits.schema.js'
import { SupervisionPolicy } from './SupervisorPolicy.schema.js'

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
