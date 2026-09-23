/// <reference types="vitest/importMeta" />
import { Array as Arr, Clock, Context, Duration, Effect, Layer, Match, Option, Ref, Result } from 'effect'
import type * as Scope from 'effect/Scope'
import {
  type Collector,
  EmptyObservationError,
  IncompleteObservationError,
  Observation,
  type ObservationFailure,
  type TransportObservationError,
} from './Observation.service.js'
import type { SpanRecord } from './TraceGraph.schema.js'

/**
 * The cadence of the poll, the quiet window the observed span set must hold
 * before the read is trusted, and the deadline the whole poll runs under.
 * Durations are refused unless they are positive, at layer construction.
 */
export interface Options {
  readonly interval: Duration.Input
  readonly settle: Duration.Input
  readonly timeout: Duration.Input
}

/**
 * One read against one store: the spans that store currently holds for a trace
 * id, or the store's own transport or unfinished answer. A source never polls,
 * waits, or retries — the cadence belongs to {@link layer}.
 */
export type TraceSource<R> = (
  traceId: string,
) => Effect.Effect<ReadonlyArray<SpanRecord>, IncompleteObservationError | TransportObservationError, R>

interface Settlement {
  readonly spans: ReadonlyArray<SpanRecord>
  readonly addedAtMillis: number
}

interface Windows {
  readonly settleMillis: number
  readonly timeoutMillis: number
}

/**
 * How one read ended: the spans are the settled answer, or the store has no
 * such trace, or the spans it holds never stayed unchanged long enough to
 * trust. `none` keeps polling.
 */
type Refusal = 'absent' | 'unfinished'

type Verdict = Result.Result<ReadonlyArray<SpanRecord>, Refusal>

interface Advance {
  readonly settlement: Settlement
  readonly verdict: Option.Option<Verdict>
}

interface Watch {
  readonly settlement: Ref.Ref<Settlement>
  readonly windows: Windows
  readonly startedAtMillis: number
}

const NO_SPANS: ReadonlyArray<SpanRecord> = []

const NEVER_READ: Settlement = { spans: NO_SPANS, addedAtMillis: 0 }

const idOf = (span: SpanRecord): string => span.spanId

const sameId = (left: SpanRecord, right: SpanRecord): boolean => left.spanId === right.spanId

const idsOf = (spans: ReadonlyArray<SpanRecord>): ReadonlySet<string> => new Set(spans.map(idOf))

const firstOfEachId = (read: ReadonlyArray<SpanRecord>): ReadonlyArray<SpanRecord> => Arr.dedupeWith(read, sameId)

const freshOf = (settlement: Settlement, read: ReadonlyArray<SpanRecord>): ReadonlyArray<SpanRecord> => {
  const known = idsOf(settlement.spans)
  return firstOfEachId(read).filter((span) => !known.has(span.spanId))
}

const absorbed = (settlement: Settlement, read: ReadonlyArray<SpanRecord>, elapsedMillis: number): Settlement => {
  const fresh = freshOf(settlement, read)
  return fresh.length === 0 ? settlement : { spans: [...settlement.spans, ...fresh], addedAtMillis: elapsedMillis }
}

const quietForLongEnough = (settlement: Settlement, elapsedMillis: number, windows: Windows): boolean =>
  settlement.spans.length > 0 && elapsedMillis - settlement.addedAtMillis >= windows.settleMillis

const pastDeadline = (elapsedMillis: number, windows: Windows): boolean => elapsedMillis >= windows.timeoutMillis

const settledVerdict = (spans: ReadonlyArray<SpanRecord>): Option.Option<Verdict> => Option.some(Result.succeed(spans))

const refusedVerdict = (refusal: Refusal): Option.Option<Verdict> => Option.some(Result.fail(refusal))

const verdictOf = (settlement: Settlement, elapsedMillis: number, windows: Windows): Option.Option<Verdict> =>
  Match.value({
    quiet: quietForLongEnough(settlement, elapsedMillis, windows),
    vacant: settlement.spans.length === 0,
    late: pastDeadline(elapsedMillis, windows),
  }).pipe(
    Match.when({ quiet: true }, () => settledVerdict(settlement.spans)),
    Match.when({ vacant: true, late: true }, () => refusedVerdict('absent')),
    Match.when({ late: true }, () => refusedVerdict('unfinished')),
    Match.orElse(() => Option.none()),
  )

const settleStep = (
  settlement: Settlement,
  read: ReadonlyArray<SpanRecord>,
  elapsedMillis: number,
  windows: Windows,
): Advance => {
  const advanced = absorbed(settlement, read, elapsedMillis)
  return { settlement: advanced, verdict: verdictOf(advanced, elapsedMillis, windows) }
}

const lateRefusal = (settlement: Settlement): Refusal => (settlement.spans.length === 0 ? 'absent' : 'unfinished')

const deadlineVerdict = (settlement: Settlement, elapsedMillis: number, windows: Windows): Option.Option<Verdict> =>
  pastDeadline(elapsedMillis, windows) ? refusedVerdict(lateRefusal(settlement)) : Option.none()

const millisOf = (input: Duration.Input): number => Duration.toMillis(input)

const windowsOf = (options: Options): Windows => ({
  settleMillis: millisOf(options.settle),
  timeoutMillis: millisOf(options.timeout),
})

const nonPositive = (options: Options): boolean =>
  [options.interval, options.settle, options.timeout].some((input) => millisOf(input) <= 0)

const requirePositive = (options: Options): Effect.Effect<void> =>
  nonPositive(options)
    ? Effect.die(
      new Error(
        `remote observation durations must be positive milliseconds: interval=${millisOf(options.interval)}, settle=${
          millisOf(options.settle)
        }, timeout=${millisOf(options.timeout)}`,
      ),
    )
    : Effect.void

const absence = (traceId: string, windows: Windows): EmptyObservationError =>
  new EmptyObservationError({
    traceId,
    detail: `the remote trace store served no span for trace ${traceId} before the ${windows.timeoutMillis}ms timeout`,
  })

const incompleteness = (
  traceId: string,
  spans: ReadonlyArray<SpanRecord>,
  windows: Windows,
): IncompleteObservationError =>
  new IncompleteObservationError({
    traceId,
    spanCount: spans.length,
    detail:
      `the remote trace store served ${spans.length} span(s) for trace ${traceId}, which never stayed unchanged for ${windows.settleMillis}ms before the ${windows.timeoutMillis}ms timeout`,
  })

const answer = (
  verdict: Verdict,
  settlement: Settlement,
  traceId: string,
  windows: Windows,
): Effect.Effect<ReadonlyArray<SpanRecord>, ObservationFailure> =>
  Result.match(verdict, {
    onSuccess: (spans) => Effect.succeed(spans),
    onFailure: (refusal) =>
      refusal === 'absent'
        ? Effect.fail(absence(traceId, windows))
        : Effect.fail(incompleteness(traceId, settlement.spans, windows)),
  })

const watching = (windows: Windows): Effect.Effect<Watch> =>
  Effect.gen(function*() {
    const startedAtMillis = yield* Clock.currentTimeMillis
    const settlement = yield* Ref.make(NEVER_READ)
    return { settlement, windows, startedAtMillis }
  })

const advanceAt = (watch: Watch, read: ReadonlyArray<SpanRecord>): Effect.Effect<Advance> =>
  Effect.gen(function*() {
    const elapsedMillis = (yield* Clock.currentTimeMillis) - watch.startedAtMillis
    return settleStep(yield* Ref.get(watch.settlement), read, elapsedMillis, watch.windows)
  })

const elapsedFor = (watch: Watch): Effect.Effect<number> =>
  Effect.map(Clock.currentTimeMillis, (now) => now - watch.startedAtMillis)

const poll = <R>(
  source: TraceSource<R>,
  traceId: string,
  options: Options,
  watch: Watch,
): Effect.Effect<ReadonlyArray<SpanRecord>, ObservationFailure, R> =>
  Effect.gen(function*() {
    const settlement = yield* Ref.get(watch.settlement)
    const elapsedMillis = yield* elapsedFor(watch)
    return yield* Option.match(deadlineVerdict(settlement, elapsedMillis, watch.windows), {
      onNone: () => readOnce(source, traceId, options, watch, watch.windows.timeoutMillis - elapsedMillis),
      onSome: (reached) => answer(reached, settlement, traceId, watch.windows),
    })
  })

const overdue = (traceId: string, watch: Watch): Effect.Effect<ReadonlyArray<SpanRecord>, ObservationFailure> =>
  Effect.flatMap(
    Ref.get(watch.settlement),
    (settlement) => answer(Result.fail(lateRefusal(settlement)), settlement, traceId, watch.windows),
  )

const readOnce = <R>(
  source: TraceSource<R>,
  traceId: string,
  options: Options,
  watch: Watch,
  remainingMillis: number,
): Effect.Effect<ReadonlyArray<SpanRecord>, ObservationFailure, R> =>
  Effect.flatMap(Effect.timeoutOption(source(traceId), remainingMillis), (answered) =>
    Option.match(answered, {
      onNone: () => overdue(traceId, watch),
      onSome: (read) => judgeRead(source, traceId, options, watch, read),
    }))

const judgeRead = <R>(
  source: TraceSource<R>,
  traceId: string,
  options: Options,
  watch: Watch,
  read: ReadonlyArray<SpanRecord>,
): Effect.Effect<ReadonlyArray<SpanRecord>, ObservationFailure, R> =>
  Effect.flatMap(advanceAt(watch, read), (advance) =>
    Option.match(advance.verdict, {
      onNone: () => keepPolling(source, traceId, options, watch, advance),
      onSome: (verdict) => answer(verdict, advance.settlement, traceId, watch.windows),
    }))

const keepPolling = <R>(
  source: TraceSource<R>,
  traceId: string,
  options: Options,
  watch: Watch,
  advance: Advance,
): Effect.Effect<ReadonlyArray<SpanRecord>, ObservationFailure, R> =>
  Effect.gen(function*() {
    yield* Ref.set(watch.settlement, advance.settlement)
    yield* Effect.sleep(options.interval)
    return yield* Effect.suspend(() => poll(source, traceId, options, watch))
  })

const collector = <R>(source: TraceSource<R>, options: Options, context: Context.Context<R>): Collector => ({
  collect: (traceId) =>
    Effect.flatMap(watching(windowsOf(options)), (watch) => poll(source, traceId, options, watch)).pipe(
      Effect.provideContext(context),
    ),
})

/**
 * The `Observation` service over one trace source. `collect` reads the source at
 * `options.interval`, keeps every span it has seen keyed by span id, and answers
 * when that union has stayed unchanged for `options.settle`; a trace the store
 * never served is `EmptyObservationError`, one that never settled is
 * `IncompleteObservationError`, and the source's own failure ends the poll
 * immediately, unchanged. Provides `Observation` alone and requires exactly what
 * the source requires (`Scope.Scope` is supplied by the layer machinery, as
 * every Effect layer constructor scopes it away).
 */
export const layer = <R>(
  source: TraceSource<R>,
  options: Options,
): Layer.Layer<Observation, never, Exclude<R, Scope.Scope>> =>
  Layer.effectContext(
    Effect.map(Effect.andThen(requirePositive(options), Effect.context<R>()), (context) =>
      Context.make(Observation, collector(source, options, context))),
  )

if (import.meta.vitest !== void 0) {
  // Dynamic imports: tsdown defines `import.meta.vitest` as `undefined`, so a static import would enter the published graph.
  const { it } = await import('@effect/vitest')
  const { Schema } = await import('effect')
  const { SpanRecord } = await import('./TraceGraph.schema.js')

  const WINDOWS: Windows = { settleMillis: 10, timeoutMillis: 100 }
  const SLOW: Windows = { settleMillis: 500, timeoutMillis: 100 }
  const Reads = Schema.Array(SpanRecord)
  const SomeReads = Schema.NonEmptyArray(SpanRecord)

  const quietAfter = (advance: Advance, elapsedMillis: number, windows: Windows): Advance =>
    settleStep(advance.settlement, NO_SPANS, elapsedMillis, windows)

  const pollingOf = (verdict: Option.Option<Verdict>): boolean => Option.isNone(verdict)

  const settledOf = (verdict: Option.Option<Verdict>): boolean => Option.exists(verdict, Result.isSuccess)

  const refusalOf = (verdict: Option.Option<Verdict>): Option.Option<Refusal> =>
    Option.flatMap(verdict, (found) => (Result.isFailure(found) ? Option.some(found.failure) : Option.none()))

  const absentOf = (verdict: Option.Option<Verdict>): boolean =>
    Option.exists(refusalOf(verdict), (refusal) => refusal === 'absent')

  const unfinishedOf = (verdict: Option.Option<Verdict>): boolean =>
    Option.exists(refusalOf(verdict), (refusal) => refusal === 'unfinished')

  const holdsId = (span: SpanRecord, spans: ReadonlyArray<SpanRecord>): boolean =>
    spans.some((candidate) => candidate.spanId === span.spanId)

  const holdsEveryId = (spans: ReadonlyArray<SpanRecord>, of: ReadonlyArray<SpanRecord>): boolean =>
    of.every((span) => holdsId(span, spans))

  const sameIds = (left: ReadonlyArray<SpanRecord>, right: ReadonlyArray<SpanRecord>): boolean => {
    const leftIds = idsOf(left)
    const rightIds = idsOf(right)
    return leftIds.size === rightIds.size && [...leftIds].every((id) => rightIds.has(id))
  }

  const firstWithId = (spans: ReadonlyArray<SpanRecord>, spanId: string): SpanRecord | undefined =>
    spans.find((candidate) => candidate.spanId === spanId)

  const keptFirstRecord = (
    spans: ReadonlyArray<SpanRecord>,
    read: ReadonlyArray<SpanRecord>,
    span: SpanRecord,
  ): boolean => firstWithId(spans, span.spanId) === firstWithId(read, span.spanId)

  const seenAfter = (read: ReadonlyArray<SpanRecord>): Advance => settleStep(NEVER_READ, read, 0, WINDOWS)

  const unionIsTheDistinctRead = (read: ReadonlyArray<SpanRecord>): boolean =>
    sameIds(seenAfter(read).settlement.spans, read)

  const replayAddsNothing = (read: ReadonlyArray<SpanRecord>): boolean => {
    const seen = seenAfter(read)
    return sameIds(quietAfter(seen, WINDOWS.settleMillis, WINDOWS).settlement.spans, seen.settlement.spans)
  }

  const laterReadKeepsEveryEarlierId = (
    earlier: ReadonlyArray<SpanRecord>,
    later: ReadonlyArray<SpanRecord>,
  ): boolean => {
    const union = settleStep(seenAfter(earlier).settlement, later, WINDOWS.settleMillis, WINDOWS).settlement.spans
    return holdsEveryId(union, earlier) && holdsEveryId(union, later)
  }

  const firstRecordOfEachIdSurvives = (read: ReadonlyArray<SpanRecord>): boolean =>
    read.every((span) => keptFirstRecord(seenAfter(read).settlement.spans, read, span))

  const settlesExactlyAtTheWindow = (read: ReadonlyArray<SpanRecord>): boolean => {
    const grown = seenAfter(read)
    return pollingOf(quietAfter(grown, WINDOWS.settleMillis - 1, WINDOWS).verdict) &&
      settledOf(quietAfter(grown, WINDOWS.settleMillis, WINDOWS).verdict)
  }

  const absenceMeansNothingWasSeen = (read: ReadonlyArray<SpanRecord>): boolean =>
    absentOf(quietAfter(seenAfter(read), WINDOWS.timeoutMillis, WINDOWS).verdict) === (read.length === 0)

  const unfinishedMeansSomethingWasSeen = (read: ReadonlyArray<SpanRecord>): boolean =>
    unfinishedOf(quietAfter(settleStep(NEVER_READ, read, 0, SLOW), SLOW.timeoutMillis, SLOW).verdict) ===
      (read.length > 0)

  it.prop('∀r_SettleUnion_=DistinctRead', [Reads], ([read]) => unionIsTheDistinctRead(read))

  it.prop('∀r_SettleReplay_≡FirstUnion', [Reads], ([read]) => replayAddsNothing(read))

  it.prop(
    '∀r_SettleShrink_⊇EveryRead',
    [Reads, Reads],
    ([earlier, later]) => laterReadKeepsEveryEarlierId(earlier, later),
  )

  it.prop('∀r_SettleFirstRecord_=FirstSeen', [Reads], ([read]) => firstRecordOfEachIdSurvives(read))

  it.prop('∀r_SettleWindow_=QuietForSettle', [SomeReads], ([read]) => settlesExactlyAtTheWindow(read))

  it.prop('∀r_SettleVacant_=AbsentAtDeadline', [Reads], ([read]) => absenceMeansNothingWasSeen(read))

  it.prop('∀r_SettleGrowing_=UnfinishedAtDeadline', [Reads], ([read]) => unfinishedMeansSomethingWasSeen(read))
}
