import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Schema } from 'effect'

const DisagreementAttemptTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/differential-spec/DisagreementAttempt',
)
type DisagreementAttemptTypeId = typeof DisagreementAttemptTypeId

export class DisagreedOnOrder
  extends Schema.TaggedClass<DisagreedOnOrder, { readonly brand: unique symbol }>()('DisagreedOnOrder', {})
{
  readonly [DisagreementAttemptTypeId] = DisagreementAttemptTypeId
}

export class DisagreedOnSeeded
  extends Schema.TaggedClass<DisagreedOnSeeded, { readonly brand: unique symbol }>()('DisagreedOnSeeded', {})
{
  readonly [DisagreementAttemptTypeId] = DisagreementAttemptTypeId
}

export class NoDisagreement
  extends Schema.TaggedClass<NoDisagreement, { readonly brand: unique symbol }>()('NoDisagreement', {})
{
  readonly [DisagreementAttemptTypeId] = DisagreementAttemptTypeId
}

export const DisagreementAttempt = Schema.Union([DisagreedOnOrder, DisagreedOnSeeded, NoDisagreement])
export type DisagreementAttempt = typeof DisagreementAttempt.Type

export class SelectDisagreementAttempt
  extends Schema.TaggedClass<SelectDisagreementAttempt, { readonly brand: unique symbol }>()(
    'SelectDisagreementAttempt',
    {
      orderDisagrees: Schema.Boolean,
      seededDisagrees: Schema.Boolean,
    },
  )
{
  static readonly [Workflow.InstrumentationBrand] = {} as const
}
