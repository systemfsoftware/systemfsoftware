export const WorkerTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/effect-daemon/Worker',
)
export type WorkerTypeId = typeof WorkerTypeId

export const SupervisorTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/effect-daemon/Supervisor',
)
export type SupervisorTypeId = typeof SupervisorTypeId

export const DynamicSpecTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/effect-daemon/DynamicSpec',
)
export type DynamicSpecTypeId = typeof DynamicSpecTypeId
