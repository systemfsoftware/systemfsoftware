import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

import { DecisionEvents, DecisionOne, DecisionTwo } from './Decision.schema.js'

/**
 * The event-list decision: one command in, zero or more past-tense facts out. The shell
 * answers each event through its handler, in list order.
 */
export class PublishDecisions extends S.TaggedClass<PublishDecisions>()('PublishDecisions', {
  count: S.Int,
}) {
  static readonly [Workflow.InstrumentationBrand] = ['count'] as const
}

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
