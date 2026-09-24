import { Schema } from 'effect'
import { RestartType as RestartTypeArb } from '../kernel/SupervisorPolicy.schema.js'

const DrawnChildren = Schema.Array(Schema.Struct({
  name: Schema.NonEmptyString,
  restart: RestartTypeArb,
}))
export type DrawnChildren = typeof DrawnChildren.Type

export { DrawnChildren }
