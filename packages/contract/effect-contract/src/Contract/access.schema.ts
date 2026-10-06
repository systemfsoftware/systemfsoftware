import { Array as Arr, Boolean as Bool, Result, Schema } from 'effect'

export class Revalidate extends Schema.TaggedClass<Revalidate>()('Revalidate', {}) {}

const deltaSecondsCeiling = 2 ** 31

export class Fresh extends Schema.TaggedClass<Fresh>()('Fresh', {
  maxAgeSeconds: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: deltaSecondsCeiling })),
}) {}

export const CachePolicy = Schema.Union([Revalidate, Fresh])
export type CachePolicy = typeof CachePolicy.Type

export const Risk = Schema.Literals(['MinimalImpact', 'ContainedWrite', 'Critical'])
export type Risk = typeof Risk.Type

export class Read extends Schema.TaggedClass<Read>()('Read', { cache: CachePolicy }) {}

export class Write extends Schema.TaggedClass<Write>()('Write', { risk: Risk }) {}

export class DurableWrite extends Schema.TaggedClass<DurableWrite>()('DurableWrite', { risk: Risk }) {}

export const Access = Schema.Union([Read, Write, DurableWrite])
export type Access = typeof Access.Type

const seeds = [
  -1,
  0,
  1,
  1.5,
  60,
  2 ** 31,
  2 ** 31 + 1,
  Number.MAX_SAFE_INTEGER,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
]

const isHttpDeltaSeconds = (seconds: number): boolean =>
  Bool.every([Number.isInteger(seconds), seconds >= 1, seconds <= 2147483648])

const freshDecodes = (seconds: number): boolean =>
  Result.isSuccess(Schema.decodeResult(Fresh)({ _tag: 'Fresh', maxAgeSeconds: seconds }))

if (import.meta.vitest !== void 0) {
  const { it } = await import('@systemfsoftware/vitest')

  it.prop(
    '∀n_FreshRefusal_≡HttpDeltaSeconds',
    { of: [Schema.Finite], subject: freshDecodes },
    (subject, [seconds]) =>
      Arr.every(Arr.append(seeds, seconds), (candidate) => subject(candidate) === isHttpDeltaSeconds(candidate)),
  )
}
