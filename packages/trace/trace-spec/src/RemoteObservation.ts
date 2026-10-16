import { Clock, Context, Duration, Effect, Layer, Match, Option, Ref, Result } from 'effect'
import { absurd, dual } from 'effect/Function'
import type * as Scope from 'effect/Scope'
import {
  type Collector,
  EmptyObservationError,
  IncompleteObservationError,
  Observation,
  type ObservationFailure,
  type TransportObservationError,
} from './Observation.service.js'
import { SettleRemoteRead, settleRemoteRead, type SettleRemoteReadDecision } from './settle-remote-read.workflow.js'
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

const settlementOf = (command: SettleRemoteRead): SettleRemoteReadDecision =>
  Result.match(settleRemoteRead(command), {
    onFailure: (unreachable: never): SettleRemoteReadDecision => absurd(unreachable),
    onSuccess: (decision): SettleRemoteReadDecision => decision,
  })

const pastDeadline = (elapsedMillis: number, windows: Windows): boolean => elapsedMillis >= windows.timeoutMillis

const settledVerdict = (spans: ReadonlyArray<SpanRecord>): Option.Option<Verdict> => Option.some(Result.succeed(spans))

const refusedVerdict = (refusal: Refusal): Option.Option<Verdict> => Option.some(Result.fail(refusal))

const verdictOfOutcome = (outcome: SettleRemoteReadDecision): Option.Option<Verdict> =>
  Match.value(outcome).pipe(
    Match.tag('ReadSettled', (settled) => settledVerdict(settled.observation.spans)),
    Match.tag('ReadAbsent', () => refusedVerdict('absent')),
    Match.tag('ReadUnfinished', () => refusedVerdict('unfinished')),
    Match.tag('ReadStillGrowing', () => Option.none()),
    Match.exhaustive,
  )

const settleStep = (
  settlement: Settlement,
  read: ReadonlyArray<SpanRecord>,
  elapsedMillis: number,
  windows: Windows,
): Advance => {
  const outcome = settlementOf(
    new SettleRemoteRead({
      observed: settlement,
      read,
      elapsedMillis,
      settleMillis: windows.settleMillis,
      timeoutMillis: windows.timeoutMillis,
    }),
  )
  return { settlement: outcome.observation, verdict: verdictOfOutcome(outcome) }
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
export const layer: {
  (options: Options): <R>(source: TraceSource<R>) => Layer.Layer<Observation, never, Exclude<R, Scope.Scope>>
  <R>(source: TraceSource<R>, options: Options): Layer.Layer<Observation, never, Exclude<R, Scope.Scope>>
} = dual(
  2,
  <R>(source: TraceSource<R>, options: Options): Layer.Layer<Observation, never, Exclude<R, Scope.Scope>> =>
    Layer.effectContext(
      Effect.map(
        Effect.andThen(requirePositive(options), Effect.context<R>()),
        (context) => Context.make(Observation, collector(source, options, context)),
      ),
    ),
)
