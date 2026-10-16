import { Schema } from 'effect'
import * as Arr from 'effect/Array'
import * as Result from 'effect/Result'

const SpanCount = Schema.Int.pipe(
  Schema.check(Schema.isGreaterThanOrEqualTo(0, { message: 'a span count is a non-negative integer' })),
)

export class IncompleteObservationError
  extends Schema.TaggedError<IncompleteObservationError>()('IncompleteObservationError', {
    traceId: Schema.String,
    spanCount: SpanCount,
    detail: Schema.String,
  })
{
  override get message(): string {
    return `Trace "${this.traceId}" is incomplete after ${this.spanCount} spans: ${this.detail}`
  }
}

const spanCountSeeds = [0, 1, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]

const nonNegativeInteger = (value: number): boolean => Number.isInteger(value) && value >= 0
const spanCountDecodes = (value: number): boolean => Result.isSuccess(Schema.decodeResult(SpanCount)(value))

if (import.meta.vitest !== void 0) {
  // Dynamic by necessity: tsdown defines `import.meta.vitest` as `undefined`, so a static import would enter the published module graph.
  const { it } = await import('@systemfsoftware/vitest')

  it.prop(
    '∀n_SpanCountRefusal_≡NonNegativeInteger',
    { of: [Schema.Int], subject: spanCountDecodes },
    (subject, [value]) =>
      Arr.every(
        Arr.append(spanCountSeeds, value),
        (candidate) => subject(candidate) === nonNegativeInteger(candidate),
      ),
  )
}
