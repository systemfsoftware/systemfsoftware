/// <reference types="vitest/importMeta" />
import { Array as Arr, Result, Schema } from 'effect'

/**
 * Generation-only bound: the production domains below span the whole
 * non-negative safe-integer range, but unbounded generation would draw
 * astronomically large counters and times in property tests
 * (compound-packs/boundary-testing/arbitrary-filter-floors.md). An
 * annotation-only check never rejects a value; it only steers the derived
 * fast-check integer generator into a small range.
 */
const generatedBetween = (minimum: number, maximum: number) =>
  Schema.makeFilter<number>(() => undefined, { arbitraryConstraint: { minimum, maximum } })

const NonNegativeSafeInt = Schema.Int.pipe(
  Schema.check(Schema.isBetween({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER })),
)

const PositiveSafeInt = Schema.Int.pipe(
  Schema.check(Schema.isBetween({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER })),
)

/** Millisecond duration; any non-negative safe integer (backoff caps and cool-downs may be long). Generation stays at most one minute. */
export const Millis = NonNegativeSafeInt.pipe(Schema.check(generatedBetween(0, 60_000)))
export type Millis = typeof Millis.Type

/** Millisecond duration that must be positive (periods, timeouts, cool-downs). Generation stays at most one minute. */
export const PositiveMillis = PositiveSafeInt.pipe(Schema.check(generatedBetween(1, 60_000)))
export type PositiveMillis = typeof PositiveMillis.Type

/** Millisecond timestamp of a supervision event: any non-negative safe integer (a supervisor may run for years). Generation stays small so event arithmetic stays in range. */
export const EventTime = NonNegativeSafeInt.pipe(Schema.check(generatedBetween(0, 1_000_000)))
export type EventTime = typeof EventTime.Type

/** Absolute millisecond deadline of an armed timer: any non-negative safe integer. Generation stays small. */
export const Deadline = NonNegativeSafeInt.pipe(Schema.check(generatedBetween(0, 1_000_000)))
export type Deadline = typeof Deadline.Type

/** How many times a child incarnation has been replaced: any non-negative safe integer. Generation stays small so generation+1 stays in range. */
export const Generation = NonNegativeSafeInt.pipe(Schema.check(generatedBetween(0, 1_024)))
export type Generation = typeof Generation.Type

/** OTP intensity (R3): any non-negative integer restarts per period. Generation stays small because laws fold intensity+1 restarts. */
export const Intensity = NonNegativeSafeInt.pipe(Schema.check(generatedBetween(0, 8)))
export type Intensity = typeof Intensity.Type

/** OTP simple_one_for_one ceiling (R6): 1..1000, matching the retired package's MAX_CHILDREN_CEILING; a zero ceiling is refused at decode. */
export const Ceiling = Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 1, maximum: 1_000 })))
export type Ceiling = typeof Ceiling.Type

/** Consecutive failed probes that decide an inferred death (KTD7): any positive safe integer. Generation stays small. */
export const ProbeThreshold = PositiveSafeInt.pipe(Schema.check(generatedBetween(1, 8)))
export type ProbeThreshold = typeof ProbeThreshold.Type

/** Consecutive failed probes observed so far: any non-negative safe integer. Generation stays small. */
export const ProbeFailures = NonNegativeSafeInt.pipe(Schema.check(generatedBetween(0, 8)))
export type ProbeFailures = typeof ProbeFailures.Type

/** Consecutive restarts of one child driving the backoff exponent (R8): any non-negative safe integer. Generation stays small so k+1 stays in range. */
export const RestartCount = NonNegativeSafeInt.pipe(Schema.check(generatedBetween(0, 1_024)))
export type RestartCount = typeof RestartCount.Type

/** Identity counter for dynamically started children: any non-negative safe integer. Generation stays small. */
export const Ordinal = NonNegativeSafeInt.pipe(Schema.check(generatedBetween(0, 1_024)))
export type Ordinal = typeof Ordinal.Type

export const ChildId = Schema.String
export type ChildId = typeof ChildId.Type

export const RequestId = Schema.String
export type RequestId = typeof RequestId.Type

const nonNegativeLimits: ReadonlyArray<Schema.Codec<number>> = [
  Millis,
  EventTime,
  Deadline,
  Generation,
  Intensity,
  ProbeFailures,
  RestartCount,
  Ordinal,
]

const positiveLimits: ReadonlyArray<Schema.Codec<number>> = [PositiveMillis, ProbeThreshold]

const decodeNonNegativeLimits = (boundary: number) =>
  Arr.map(nonNegativeLimits, (schema) => Schema.decodeResult(schema)(boundary))

const decodePositiveLimits = (boundary: number) =>
  Arr.map(positiveLimits, (schema) => Schema.decodeResult(schema)(boundary))

const decodeCeiling = Schema.decodeResult(Ceiling)

const withinBound = (value: number, minimum: number, maximum: number): boolean => value >= minimum && value <= maximum

const generatedStaysSmall = (values: readonly [number, number, number, number, number]): boolean => {
  const [millis, positive, time, deadline, counter] = values
  return Arr.every<readonly [number, number, number]>([
    [millis, 0, 60_000],
    [positive, 1, 60_000],
    [time, 0, 1_000_000],
    [deadline, 0, 1_000_000],
    [counter, 0, 1_024],
  ], (bounds) => withinBound(bounds[0], bounds[1], bounds[2]))
}

if (import.meta.vitest !== void 0) {
  // Dynamic by necessity: tsdown defines `import.meta.vitest` as `undefined`, so this
  // branch is statically dead in the build and a static import would enter the published
  // module graph.
  const { it } = await import('@effect/vitest')

  it.prop(
    '∀m_NonNegativeBounds_=Decode',
    { of: [Schema.Literals([-1, 0, 1, 1_025, Number.MAX_SAFE_INTEGER])], subject: decodeNonNegativeLimits },
    (subject, [boundary]) => Arr.every(subject(boundary), (decoded) => Result.isSuccess(decoded) === (boundary >= 0)),
  )

  it.prop(
    '∀m_PositiveBounds_=Decode',
    { of: [Schema.Literals([-1, 0, 1, Number.MAX_SAFE_INTEGER])], subject: decodePositiveLimits },
    (subject, [boundary]) => Arr.every(subject(boundary), (decoded) => Result.isSuccess(decoded) === (boundary >= 1)),
  )

  it.prop(
    '∀c_Ceiling_=OneToThousand',
    { of: [Schema.Literals([0, 1, 1_000, 1_001])], subject: decodeCeiling },
    (subject, [boundary]) => Result.isSuccess(subject(boundary)) === (boundary >= 1 && boundary <= 1_000),
  )

  it.prop(
    '∀m_Generated_=Small',
    { of: [Millis, PositiveMillis, EventTime, Deadline, RestartCount], subject: generatedStaysSmall },
    (subject, values) => subject(values) && !subject([60_001, 1, 0, 0, 0] as const),
  )
}
