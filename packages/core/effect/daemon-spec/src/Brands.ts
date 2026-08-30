/** @public */
export const WorkerTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/effect-daemon/Worker',
)
/** @public */
export type WorkerTypeId = typeof WorkerTypeId

/** @public */
export const SupervisorTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/effect-daemon/Supervisor',
)
/** @public */
export type SupervisorTypeId = typeof SupervisorTypeId

/** @public */
export const DynamicSpecTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/effect-daemon/DynamicSpec',
)
/** @public */
export type DynamicSpecTypeId = typeof DynamicSpecTypeId
