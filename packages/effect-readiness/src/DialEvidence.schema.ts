/// <reference types="vitest/importMeta" />
import { Schema } from 'effect'
import * as Arr from 'effect/Array'
import * as Result from 'effect/Result'

export const StatusCode = Schema.Int.pipe(
  Schema.check(
    Schema.isBetween(
      { minimum: 100, maximum: 599 },
      { message: 'an HTTP status code is an integer between 100 and 599' },
    ),
  ),
  Schema.brand('StatusCode'),
)
export type StatusCode = typeof StatusCode.Type

/** The status line's provider grammar lives in the adapter that reads it: `drivers/http-status-line.schema.ts`. */
export const Responded = Schema.TaggedStruct('Responded', { statusCode: StatusCode })
export type Responded = typeof Responded.Type

export const Connected = Schema.TaggedStruct('Connected', {})
export const Refused = Schema.TaggedStruct('Refused', {})
export const DialEvidence = Schema.Union([Connected, Refused])
export type DialEvidence = typeof DialEvidence.Type

export const HttpEvidence = Schema.Union([Responded, Refused])
export type HttpEvidence = typeof HttpEvidence.Type

const STATUS_CODE_SEEDS: ReadonlyArray<number> = [
  -1,
  0,
  99,
  100,
  599,
  600,
  1000,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
]

const withinStatusRange = (value: number): boolean => value >= 100 && value <= 599

const isStatusCode = (value: number): boolean => Number.isInteger(value) && withinStatusRange(value)

const statusCodeDecodes = (value: number): boolean => Result.isSuccess(Schema.decodeResult(StatusCode)(value))

if (import.meta.vitest !== void 0) {
  // Dynamic by necessity: tsdown defines `import.meta.vitest` as `undefined`, so a static import
  // would enter the published module graph.
  const { it } = await import('@systemfsoftware/vitest')

  it.prop(
    '∀n_StatusCodeRefusal_∈Bounds',
    { of: [Schema.Int], subject: statusCodeDecodes },
    (subject, [value]) =>
      Arr.every(
        Arr.append(STATUS_CODE_SEEDS, value),
        (candidate) => subject(candidate) === isStatusCode(candidate),
      ),
  )
}
