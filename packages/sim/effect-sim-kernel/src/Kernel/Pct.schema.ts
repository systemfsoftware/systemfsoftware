/// <reference types="vitest/importMeta" />
import { Array as Arr, Order, Result, Schema } from 'effect'

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

const BOUNDARY_SEEDS: ReadonlyArray<number> = [
  -1,
  0,
  0.5,
  1,
  2,
  Number.MAX_SAFE_INTEGER,
  Number.MAX_SAFE_INTEGER + 2,
  Number.NaN,
  Number.POSITIVE_INFINITY,
]

const wholeAtLeast = (minimum: number) => (value: number): boolean => Number.isSafeInteger(value) && value >= minimum

const depthDecodes = (value: number): boolean => Result.isSuccess(Schema.decodeResult(PctDepth)(value))

const seedCountDecodes = (value: number): boolean => Result.isSuccess(Schema.decodeResult(PctSeedCount)(value))

const stepCountDecodes = (value: number): boolean => Result.isSuccess(Schema.decodeResult(PctStepCount)(value))

if (import.meta.vitest !== void 0) {
  // Dynamic: tsdown defines `import.meta.vitest` as `undefined`, so a static import would enter the published graph.
  const { it } = await import('@systemfsoftware/vitest')

  it.prop(
    '∀n_PctDepthRefusal_=WholeAndAtLeastOne',
    { of: [Schema.Finite], subject: depthDecodes },
    (subject, [value]) =>
      Arr.every(Arr.append(BOUNDARY_SEEDS, value), (candidate) => subject(candidate) === wholeAtLeast(1)(candidate)),
  )

  it.prop(
    '∀n_PctSeedCountRefusal_=WholeAndAtLeastZero',
    { of: [Schema.Finite], subject: seedCountDecodes },
    (subject, [value]) =>
      Arr.every(Arr.append(BOUNDARY_SEEDS, value), (candidate) => subject(candidate) === wholeAtLeast(0)(candidate)),
  )

  it.prop(
    '∀n_PctStepCountRefusal_=WholeAndAtLeastZero',
    { of: [Schema.Finite], subject: stepCountDecodes },
    (subject, [value]) =>
      Arr.every(Arr.append(BOUNDARY_SEEDS, value), (candidate) => subject(candidate) === wholeAtLeast(0)(candidate)),
  )
}
