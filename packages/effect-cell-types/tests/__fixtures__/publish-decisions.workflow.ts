import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

import { Decision, DecisionOne, DecisionTwo } from './accept-tagged-command.workflow.js'

export class PublishDecisions extends S.TaggedClass<PublishDecisions>()('PublishDecisions', {
  count: S.Int,
}) {
  static readonly [Workflow.InstrumentationBrand] = { count: 'tests.publishing.count' } as const
}

export const DecisionEvents = S.Array(Decision)

export const publishDecisions = Workflow.make({
  command: PublishDecisions,
  decision: DecisionEvents,
  error: S.Never,
  decide: (command: PublishDecisions): Result.Result<ReadonlyArray<DecisionOne | DecisionTwo>, never> =>
    Result.succeed(
      Array.from({ length: Math.max(command.count, 0) }, (_, index) =>
        index % 2 === 0
          ? new DecisionOne({ value: index })
          : new DecisionTwo({ reason: `event-${index}` })),
    ),
})
