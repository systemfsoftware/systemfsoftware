import { Schema } from 'effect'

export const RestartDecisionTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/effect-daemon/RestartDecision',
)
export type RestartDecisionTypeId = typeof RestartDecisionTypeId

export class Continue extends Schema.TaggedClass<Continue>()('Continue', {}) {
  readonly [RestartDecisionTypeId] = RestartDecisionTypeId
}

export class Restart extends Schema.TaggedClass<Restart>()('Restart', {
  indices: Schema.NonEmptyArray(Schema.Int),
}) {
  readonly [RestartDecisionTypeId] = RestartDecisionTypeId
}

export class Exhausted extends Schema.TaggedClass<Exhausted>()('Exhausted', {}) {
  readonly [RestartDecisionTypeId] = RestartDecisionTypeId
}

export const RestartDecision = Schema.Union(Continue, Restart, Exhausted)
export type RestartDecision = typeof RestartDecision.Type

export const RestartStrategy = Schema.Literal('one_for_one', 'one_for_all', 'rest_for_one')
export type RestartStrategy = typeof RestartStrategy.Type

export const DecideInput = Schema.Struct({
  strategy: RestartStrategy,
  totalChildren: Schema.Int.pipe(Schema.between(1, 10)),
  failedIndex: Schema.Int.pipe(Schema.greaterThanOrEqualTo(0)),
  exitSuccess: Schema.Boolean,
  intensityExceeded: Schema.Boolean,
}).pipe(
  Schema.filter((s) => s.failedIndex < s.totalChildren, {
    message: () => 'failedIndex must be < totalChildren',
  }),
  Schema.annotations({
    arbitrary: () => (fc) =>
      fc.integer({ min: 1, max: 10 }).chain((totalChildren) =>
        fc.integer({ min: 0, max: totalChildren - 1 }).chain((failedIndex) =>
          fc.record({
            strategy: fc.constantFrom(
              'one_for_one' as const,
              'one_for_all' as const,
              'rest_for_one' as const,
            ),
            totalChildren: fc.constant(totalChildren),
            failedIndex: fc.constant(failedIndex),
            exitSuccess: fc.boolean(),
            intensityExceeded: fc.boolean(),
          })
        )
      ),
  }),
)
export type DecideInput = typeof DecideInput.Type
