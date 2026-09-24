import { Schema } from 'effect'
import { ChildRef, ObservedStep } from '../../src/Trace.schema.js'

/** A bounded trace position, so a divergence can be planted within an observed trace. */
export const Index = Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: 31 })))
export type Index = typeof Index.Type

/** A trace guaranteed to hold at least one step, so a planted divergence always lands. */
export const NonEmptyTrace = Schema.Struct({
  scenario: Schema.String,
  medium: Schema.String,
  steps: Schema.NonEmptyArray(ObservedStep),
})
export type NonEmptyTrace = typeof NonEmptyTrace.Type

/** Two child starts whose order a declaration must never accept as interchangeable. */
export const StartSwapCase = Schema.Struct({
  scenario: Schema.String,
  medium: Schema.String,
  first: ChildRef,
  suffix: Schema.NonEmptyString,
})
export type StartSwapCase = typeof StartSwapCase.Type
