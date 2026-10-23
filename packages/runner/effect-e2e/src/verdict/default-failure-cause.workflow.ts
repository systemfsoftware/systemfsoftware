import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Arr from 'effect/Array'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'

import { type Cause, ProposedCause } from './cause.schema.js'
import { failureClassOf } from './failure-class.schema.js'
import { FailureCode } from './failure.schema.js'

const DefaultCauseTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-e2e/DefaultCause')
type DefaultCauseTypeId = typeof DefaultCauseTypeId

const recorded = { proposed: Schema.optionalKey(ProposedCause) }

export class ProductCause extends Schema.TaggedClass<ProductCause>()('ProductCause', recorded) {
  readonly [DefaultCauseTypeId] = DefaultCauseTypeId
}

export class AutomationCause extends Schema.TaggedClass<AutomationCause>()('AutomationCause', recorded) {
  readonly [DefaultCauseTypeId] = DefaultCauseTypeId
}

export class EnvironmentCause extends Schema.TaggedClass<EnvironmentCause>()('EnvironmentCause', recorded) {
  readonly [DefaultCauseTypeId] = DefaultCauseTypeId
}

export class UnclassifiedCause extends Schema.TaggedClass<UnclassifiedCause>()('UnclassifiedCause', recorded) {
  readonly [DefaultCauseTypeId] = DefaultCauseTypeId
}

export const DefaultCause = Schema.Union([ProductCause, AutomationCause, EnvironmentCause, UnclassifiedCause])
export type DefaultCause = typeof DefaultCause.Type

export class DefaultFailureCause extends Schema.TaggedClass<DefaultFailureCause>()('DefaultFailureCause', {
  code: Schema.String,
  proposed: Schema.optionalKey(ProposedCause),
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

interface Recorded {
  readonly proposed?: ProposedCause
}

const UNEVIDENCED: ProposedCause = { cause: 'unclassified', evidence: [] }

const normalizedOf = (proposed: ProposedCause): ProposedCause =>
  Arr.match(proposed.evidence, { onEmpty: () => UNEVIDENCED, onNonEmpty: () => proposed })

const recordedOf = (command: DefaultFailureCause): Recorded =>
  Option.match(Option.fromUndefinedOr(command.proposed), {
    onNone: (): Recorded => ({}),
    onSome: (proposed): Recorded => ({ proposed: normalizedOf(proposed) }),
  })

const causeOf = (code: string): Cause =>
  Option.match(Schema.decodeUnknownOption(FailureCode)(code), {
    onNone: (): Cause => 'unclassified',
    onSome: (known) => failureClassOf(known).cause,
  })

const decideDefaultCause = (command: DefaultFailureCause): Result.Result<DefaultCause, never> =>
  Result.succeed(
    Match.value(causeOf(command.code)).pipe(
      Match.when('product', (): DefaultCause => new ProductCause(recordedOf(command))),
      Match.when('automation', (): DefaultCause => new AutomationCause(recordedOf(command))),
      Match.when('environment', (): DefaultCause => new EnvironmentCause(recordedOf(command))),
      Match.when('unclassified', (): DefaultCause => new UnclassifiedCause(recordedOf(command))),
      Match.exhaustive,
    ),
  )

export const defaultFailureCause = Workflow.make({
  command: DefaultFailureCause,
  decision: DefaultCause,
  error: Schema.Never,
  decide: decideDefaultCause,
})
