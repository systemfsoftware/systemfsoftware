import { Array as Arr, Schema } from 'effect'
import type { RestartType } from '../../src/kernel/SupervisorPolicy.schema.js'
import { RestartType as RestartTypeArb } from '../../src/kernel/SupervisorPolicy.schema.js'

const DrawnChildren = Schema.Array(Schema.Struct({
  name: Schema.NonEmptyString,
  restart: RestartTypeArb,
}))
export type DrawnChildren = typeof DrawnChildren.Type

export interface DrawnChild {
  readonly name: string
  readonly restart: RestartType
}

const drawnOf = (drawn: DrawnChildren): ReadonlyArray<DrawnChild> =>
  Arr.map(drawn, (child) => ({ name: child['name'], restart: child['restart'] }))

export const drawnChildrenOf = (drawn: DrawnChildren): ReadonlyArray<DrawnChild> => drawnOf(drawn)

export { DrawnChildren }
