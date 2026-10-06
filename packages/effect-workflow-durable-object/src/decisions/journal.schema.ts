/// <reference types="vitest/importMeta" />
import { Array as Arr, Schema } from 'effect'
import * as Result from 'effect/Result'

/** The name an activity runs under inside its workflow. */
export const ActivityName = Schema.NonEmptyString.pipe(
  Schema.brand('@systemfsoftware/effect-workflow-durable-object/ActivityName'),
)
export type ActivityName = typeof ActivityName.Type

/** The name of a durable deferred inside one execution. */
export const DeferredName = Schema.NonEmptyString.pipe(
  Schema.brand('@systemfsoftware/effect-workflow-durable-object/DeferredName'),
)
export type DeferredName = typeof DeferredName.Type

/** The name of a durable clock inside one execution. */
export const ClockName = Schema.NonEmptyString.pipe(
  Schema.brand('@systemfsoftware/effect-workflow-durable-object/ClockName'),
)
export type ClockName = typeof ClockName.Type

/** Which run of an activity this is; the first run is attempt 1. */
export const Attempt = Schema.Int.pipe(
  Schema.check(Schema.isGreaterThanOrEqualTo(1)),
  Schema.brand('@systemfsoftware/effect-workflow-durable-object/Attempt'),
)
export type Attempt = typeof Attempt.Type

// The latest instant a JavaScript `Date` can hold, in milliseconds since the Unix epoch.
const LATEST_DATE_MILLIS = 8_640_000_000_000_000

/** A wall-clock instant in milliseconds since the Unix epoch, up to the latest a `Date` holds. */
export const EpochMillis = Schema.Int.pipe(
  Schema.check(Schema.isBetween({ minimum: 0, maximum: LATEST_DATE_MILLIS })),
  Schema.brand('@systemfsoftware/effect-workflow-durable-object/EpochMillis'),
)
export type EpochMillis = typeof EpochMillis.Type

/** The latest instant a JavaScript `Date` can hold. */
export const LATEST_EPOCH_MILLIS: EpochMillis = EpochMillis.make(LATEST_DATE_MILLIS)

/** How long the alarm waits before it recovers an unfinished drain: at least 1 ms, at most a day. */
export const LeaseMillis = Schema.Int.pipe(
  Schema.check(Schema.isBetween({ minimum: 1, maximum: 86_400_000 })),
  Schema.brand('@systemfsoftware/effect-workflow-durable-object/LeaseMillis'),
)
export type LeaseMillis = typeof LeaseMillis.Type

/** A workflow, activity or deferred exit as the workflow's own schemas encode it. */
export const EncodedExit = Schema.Json.pipe(
  Schema.brand('@systemfsoftware/effect-workflow-durable-object/EncodedExit'),
)
export type EncodedExit = typeof EncodedExit.Type

/** A workflow payload as the workflow's own schema encodes it. */
export const EncodedPayload = Schema.Json.pipe(
  Schema.brand('@systemfsoftware/effect-workflow-durable-object/EncodedPayload'),
)
export type EncodedPayload = typeof EncodedPayload.Type

/** One activity run: the activity's name and its attempt. */
export const ActivityKey = Schema.Struct({ name: ActivityName, attempt: Attempt })
export type ActivityKey = typeof ActivityKey.Type

/** A journaled activity exit. Only a completed exit is journaled; a suspended one never is. */
export const ActivityRow = Schema.Struct({ key: ActivityKey, exit: EncodedExit })
export type ActivityRow = typeof ActivityRow.Type

/** A completed deferred. A deferred with no row is still open. */
export const DeferredRow = Schema.Struct({ name: DeferredName, exit: EncodedExit })
export type DeferredRow = typeof DeferredRow.Type

/** A durable clock: scheduled to wake its deferred at an instant, or already fired. */
export const ClockRow = Schema.TaggedUnion({
  Scheduled: { name: ClockName, deferred: DeferredName, wakeAt: EpochMillis },
  Fired: { name: ClockName },
})
export type ClockRow = typeof ClockRow.Type

/** Whether an interrupt of a live execution has been requested. */
export const Interruption = Schema.TaggedUnion({
  NotRequested: {},
  Requested: {},
})
export type Interruption = typeof Interruption.Type

/**
 * One execution's lifecycle. `Running` has not yet reached a result in its current replay;
 * `Suspended` reached one and waits for a wake; `Complete` holds the final exit.
 */
export const ExecutionState = Schema.TaggedUnion({
  Absent: {},
  Running: { interruption: Interruption },
  Suspended: { interruption: Interruption },
  Complete: { exit: EncodedExit },
})
export type ExecutionState = typeof ExecutionState.Type

/** The mailbox: every event processed, or at least one event still waiting for its replay. */
export const Mailbox = Schema.TaggedUnion({
  Drained: {},
  ReplayPending: {},
})
export type Mailbox = typeof Mailbox.Type

/** Who completed a deferred: the execution's own running replay, or anyone outside it. */
export const DeferredOrigin = Schema.TaggedUnion({
  RunningReplay: {},
  Outside: {},
})
export type DeferredOrigin = typeof DeferredOrigin.Type

/** An inbound event for one execution. Every event is recorded in one storage transaction. */
export const ExecutionEvent = Schema.TaggedUnion({
  Execute: { payload: EncodedPayload },
  Resume: {},
  DeferredDone: { name: DeferredName, exit: EncodedExit, origin: DeferredOrigin },
  ClockFired: { name: ClockName },
  Interrupt: {},
  AlarmWake: {},
})
export type ExecutionEvent = typeof ExecutionEvent.Type

/** One journal write an event's decision asks for. */
export const JournalWrite = Schema.TaggedUnion({
  CreateExecution: { payload: EncodedPayload },
  CompleteDeferred: { name: DeferredName, exit: EncodedExit },
  FireClock: { name: ClockName, deferred: DeferredName },
  RequestInterrupt: {},
})
export type JournalWrite = typeof JournalWrite.Type

const ATTEMPT_SEEDS: ReadonlyArray<number | string> = [
  -1,
  0,
  1,
  LATEST_DATE_MILLIS,
  Number.MAX_SAFE_INTEGER,
  Number.MAX_SAFE_INTEGER + 1,
  1.5,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
  '',
  '1',
  '1.5',
  'null',
]
const EPOCH_MILLIS_SEEDS: ReadonlyArray<number | string> = [
  -1,
  0,
  1,
  LATEST_DATE_MILLIS,
  LATEST_DATE_MILLIS + 1,
  Number.MAX_SAFE_INTEGER + 1,
  1.5,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
  '',
  '1',
  '1.5',
]
const LEASE_MILLIS_SEEDS: ReadonlyArray<number | string> = [
  -1,
  0,
  1,
  86_400_000,
  86_400_000 + 1,
  LATEST_DATE_MILLIS,
  1.5,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
  '',
  '1',
  '1.5',
]

// The domain contracts, written from each schema's documentation, never from its checks.
const asNumber = (value: number | string): number => typeof value === 'number' ? value : Number.NaN
const within = (value: number, minimum: number, maximum: number): boolean => value >= minimum && value <= maximum
const isAttempt = (value: number | string): boolean => Number.isSafeInteger(asNumber(value)) && asNumber(value) >= 1
const isEpochMillis = (value: number | string): boolean =>
  Number.isSafeInteger(asNumber(value)) && within(asNumber(value), 0, LATEST_DATE_MILLIS)
const isLeaseMillis = (value: number | string): boolean =>
  Number.isSafeInteger(asNumber(value)) && within(asNumber(value), 1, 86_400_000)

const attemptDecodes = (value: number | string): boolean => Result.isSuccess(Schema.decodeUnknownResult(Attempt)(value))
const epochMillisDecodes = (value: number | string): boolean =>
  Result.isSuccess(Schema.decodeUnknownResult(EpochMillis)(value))
const leaseMillisDecodes = (value: number | string): boolean =>
  Result.isSuccess(Schema.decodeUnknownResult(LeaseMillis)(value))

const verdictsAgainst = (
  decodes: (value: number | string) => boolean,
  shape: (value: number | string) => boolean,
  candidates: ReadonlyArray<number | string>,
): boolean => Arr.every(candidates, (candidate) => decodes(candidate) === shape(candidate))

const roundTripOf = <A, I>(schema: Schema.Codec<A, I>) => (value: A): Result.Result<A, Schema.SchemaError> =>
  Result.flatMap(Schema.encodeResult(schema)(value), Schema.decodeResult(schema))

if (import.meta.vitest !== void 0) {
  // Dynamic by necessity: tsdown defines `import.meta.vitest` as `undefined`, and a static load of
  // the test runner would enter the published module graph.
  const { it } = await import('@systemfsoftware/vitest')

  // Round-trips: this package ships no generated law suite, so these predicates are the only
  // coverage of every journal schema's encode∘decode identity.
  const assertRoundTrips = <A, I>(label: string, schema: Schema.Codec<A, I>): void => {
    const typeEq = Schema.toEquivalence(schema)
    it.prop(
      `∀x_${label}_=x`,
      { of: [schema], subject: roundTripOf(schema) },
      (subject, [value]) =>
        Result.match(subject(value), { onFailure: () => false, onSuccess: (back) => typeEq(back, value) }),
    )
  }

  assertRoundTrips('ActivityName', ActivityName)
  assertRoundTrips('DeferredName', DeferredName)
  assertRoundTrips('ClockName', ClockName)
  assertRoundTrips('Attempt', Attempt)
  assertRoundTrips('EpochMillis', EpochMillis)
  assertRoundTrips('LeaseMillis', LeaseMillis)
  assertRoundTrips('EncodedExit', EncodedExit)
  assertRoundTrips('EncodedPayload', EncodedPayload)
  assertRoundTrips('ActivityKey', ActivityKey)
  assertRoundTrips('ActivityRow', ActivityRow)
  assertRoundTrips('DeferredRow', DeferredRow)
  assertRoundTrips('ClockRow', ClockRow)
  assertRoundTrips('Interruption', Interruption)
  assertRoundTrips('ExecutionState', ExecutionState)
  assertRoundTrips('Mailbox', Mailbox)
  assertRoundTrips('DeferredOrigin', DeferredOrigin)
  assertRoundTrips('ExecutionEvent', ExecutionEvent)
  assertRoundTrips('JournalWrite', JournalWrite)

  // Refusals: the generated schema laws accept only, so each refinement states its boundary here,
  // drawn from the unrefined base plus a wrong type, with an independent predicate and edges appended.
  it.prop(
    '∀x_AttemptRefusal_≡PositiveSafeInt',
    { of: [Schema.Union([Schema.Int, Schema.String])], subject: attemptDecodes },
    (subject, [value]) => verdictsAgainst(subject, isAttempt, Arr.append(ATTEMPT_SEEDS, value)),
  )
  it.prop(
    '∀x_EpochMillisRefusal_≡SafeIntInRange',
    { of: [Schema.Union([Schema.Int, Schema.String])], subject: epochMillisDecodes },
    (subject, [value]) => verdictsAgainst(subject, isEpochMillis, Arr.append(EPOCH_MILLIS_SEEDS, value)),
  )
  it.prop(
    '∀x_LeaseMillisRefusal_≡SafeIntInRange',
    { of: [Schema.Union([Schema.Int, Schema.String])], subject: leaseMillisDecodes },
    (subject, [value]) => verdictsAgainst(subject, isLeaseMillis, Arr.append(LEASE_MILLIS_SEEDS, value)),
  )
}
