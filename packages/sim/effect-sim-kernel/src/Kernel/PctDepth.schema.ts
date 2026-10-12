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

const DEPTH_SEEDS: ReadonlyArray<number> = [
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

const isDepth = (value: number): boolean => Number.isSafeInteger(value) && value >= 1

const depthDecodes = (value: number): boolean => Result.isSuccess(Schema.decodeResult(PctDepth)(value))

if (import.meta.vitest !== void 0) {
  // Dynamic: tsdown defines `import.meta.vitest` as `undefined`, so a static import would enter the published graph.
  const { it } = await import('@systemfsoftware/vitest')

  it.prop(
    '∀n_PctDepthRefusal_=WholeAndAtLeastOne',
    { of: [Schema.Finite], subject: depthDecodes },
    (subject, [value]) =>
      Arr.every(Arr.append(DEPTH_SEEDS, value), (candidate) => subject(candidate) === isDepth(candidate)),
  )
}
