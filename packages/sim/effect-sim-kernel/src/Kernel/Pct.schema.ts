import { Order, Schema } from 'effect'

const generatedBetween = (minimum: number, maximum: number) =>
  Schema.makeFilter<number>(() => undefined, { arbitraryConstraint: { order: Order.Number, minimum, maximum } })

export const PctDepth = Schema.Int.pipe(
  Schema.check(
    Schema.isBetween(
      { minimum: 1, maximum: Number.MAX_SAFE_INTEGER },
      { message: 'a PCT depth is a whole number of at least 1' },
    ),
  ),
  Schema.check(generatedBetween(1, 5)),
  Schema.brand('PctDepth'),
)
export type PctDepth = typeof PctDepth.Type

export const PctSeedCount = Schema.Int.pipe(
  Schema.check(
    Schema.isBetween(
      { minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
      { message: 'a PCT seed count is a whole number of at least 0' },
    ),
  ),
  Schema.check(generatedBetween(0, 3)),
  Schema.brand('PctSeedCount'),
)
export type PctSeedCount = typeof PctSeedCount.Type

export const PctStepCount = Schema.Int.pipe(
  Schema.check(
    Schema.isBetween(
      { minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
      { message: 'a PCT step count is a whole number of explored decisions, at least 0' },
    ),
  ),
  Schema.check(generatedBetween(0, 10_000)),
  Schema.brand('PctStepCount'),
)
export type PctStepCount = typeof PctStepCount.Type
