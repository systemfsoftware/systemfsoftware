import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'

import { type Cause, RecordedProposal, recordedProposalOf } from './cause.schema.js'
import { failureClassOf } from './failure-class.schema.js'
import { FailureCode } from './failure.schema.js'

const DefaultCauseTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-e2e/DefaultCause')
type DefaultCauseTypeId = typeof DefaultCauseTypeId

export class ProductCause extends Schema.TaggedClass<ProductCause>()('ProductCause', RecordedProposal.fields) {
  readonly [DefaultCauseTypeId] = DefaultCauseTypeId
}

export class AutomationCause extends Schema.TaggedClass<AutomationCause>()('AutomationCause', RecordedProposal.fields) {
  readonly [DefaultCauseTypeId] = DefaultCauseTypeId
}

export class EnvironmentCause
  extends Schema.TaggedClass<EnvironmentCause>()('EnvironmentCause', RecordedProposal.fields)
{
  readonly [DefaultCauseTypeId] = DefaultCauseTypeId
}

export class UnclassifiedCause
  extends Schema.TaggedClass<UnclassifiedCause>()('UnclassifiedCause', RecordedProposal.fields)
{
  readonly [DefaultCauseTypeId] = DefaultCauseTypeId
}

export const DefaultCause = Schema.Union([ProductCause, AutomationCause, EnvironmentCause, UnclassifiedCause])
export type DefaultCause = typeof DefaultCause.Type

export class DefaultFailureCause extends Schema.TaggedClass<DefaultFailureCause>()('DefaultFailureCause', {
  code: Schema.String,
  ...RecordedProposal.fields,
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

const decodeFailureCode = Schema.decodeUnknownOption(FailureCode)

const causeOf = (code: string): Cause =>
  Option.match(decodeFailureCode(code), {
    onNone: (): Cause => 'unclassified',
    onSome: (known) => failureClassOf(known).cause,
  })

const decideDefaultCause = (command: DefaultFailureCause): Result.Result<DefaultCause, never> => {
  const recorded = recordedProposalOf(command.proposed)
  return Result.succeed(
    Match.value(causeOf(command.code)).pipe(
      Match.when('product', (): DefaultCause => new ProductCause(recorded)),
      Match.when('automation', (): DefaultCause => new AutomationCause(recorded)),
      Match.when('environment', (): DefaultCause => new EnvironmentCause(recorded)),
      Match.when('unclassified', (): DefaultCause => new UnclassifiedCause(recorded)),
      Match.exhaustive,
    ),
  )
}

export const defaultFailureCause = Workflow.make({
  command: DefaultFailureCause,
  decision: DefaultCause,
  error: Schema.Never,
  decide: decideDefaultCause,
})
