import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Schema } from 'effect'
import * as Result from 'effect/Result'

const DisagreementAttemptTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/differential-spec/DisagreementAttempt',
)
type DisagreementAttemptTypeId = typeof DisagreementAttemptTypeId

export class DisagreedOnOrder extends Schema.TaggedClass<DisagreedOnOrder>()('DisagreedOnOrder', {}) {
  readonly [DisagreementAttemptTypeId] = DisagreementAttemptTypeId
}

export class DisagreedOnSeeded extends Schema.TaggedClass<DisagreedOnSeeded>()('DisagreedOnSeeded', {}) {
  readonly [DisagreementAttemptTypeId] = DisagreementAttemptTypeId
}

export class NoDisagreement extends Schema.TaggedClass<NoDisagreement>()('NoDisagreement', {}) {
  readonly [DisagreementAttemptTypeId] = DisagreementAttemptTypeId
}

export const DisagreementAttempt = Schema.Union([DisagreedOnOrder, DisagreedOnSeeded, NoDisagreement])
export type DisagreementAttempt = typeof DisagreementAttempt.Type

export class SelectDisagreementAttempt extends Schema.TaggedClass<SelectDisagreementAttempt>()(
  'SelectDisagreementAttempt',
  {
    orderDisagrees: Schema.Boolean,
    seededDisagrees: Schema.Boolean,
  },
) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

const judgedSeeded = (seededDisagrees: boolean): DisagreementAttempt =>
  Match.value(seededDisagrees).pipe(
    Match.when(true, () => new DisagreedOnSeeded({})),
    Match.when(false, () => new NoDisagreement({})),
    Match.exhaustive,
  )

export const selectDisagreementAttempt = Workflow.make({
  command: SelectDisagreementAttempt,
  decision: DisagreementAttempt,
  error: Schema.Never,
  decide: (command): Result.Result<DisagreementAttempt, never> =>
    Result.succeed(
      Match.value(command.orderDisagrees).pipe(
        Match.when(true, () => new DisagreedOnOrder({})),
        Match.when(false, () => judgedSeeded(command.seededDisagrees)),
        Match.exhaustive,
      ),
    ),
})
