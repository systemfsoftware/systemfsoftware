import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Result, Schema } from 'effect'
import { SupervisionDecision } from './interpret-supervision-event.workflow.js'
import { evolved, SupervisorState } from './SupervisorState.schema.js'

export class SupervisionEvolution extends Schema.TaggedClass<SupervisionEvolution>()('SupervisionEvolution', {
  state: SupervisorState,
  decision: SupervisionDecision,
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

export const evolveSupervisor = Workflow.make({
  command: SupervisionEvolution,
  decision: SupervisorState,
  error: Schema.Never,
  decide: (step): Result.Result<SupervisorState, never> => Result.succeed(evolved(step.state, step.decision)),
})
