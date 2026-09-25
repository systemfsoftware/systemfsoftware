import { Graph, Observation, RemoteObservation } from '@systemfsoftware/trace-spec'
import { Array as Arr, Context, Duration, Effect, Layer, Match, Ref, Result, Schema } from 'effect'

import type { TraceCommand, TraceResponse } from './trace-store.model.js'

interface Held {
  readonly trace: string
  readonly spans: ReadonlyArray<string>
  readonly delivery: 'served' | 'growing' | 'stalling'
}

interface StoreTable {
  readonly held: ReadonlyArray<Held>
  readonly grown: Record<string, number>
  readonly answered: Record<string, number>
}

const NO_SPANS: ReadonlyArray<Graph.SpanRecord> = []

const spanOf = (traceId: string, spanId: string): Graph.SpanRecord => ({
  traceId,
  spanId,
  parentSpanId: null,
  name: 'remote.store.span',
  status: 'ok',
  errorType: null,
  startMillis: 0,
  durationMillis: 1,
  attributes: {},
  events: [],
  links: [],
})

const waitedMillis = (state: StoreTable, traceId: string): number => state.grown[traceId] ?? 0

const answeredReads = (state: StoreTable, traceId: string): number => state.answered[traceId] ?? 0

const servedGrowing = (state: StoreTable, traceId: string): ReadonlyArray<Graph.SpanRecord> =>
  Arr.range(1, waitedMillis(state, traceId) + 1).map((index) => spanOf(traceId, `grown-span-${index}`))

const servedHeld = (held: Held, traceId: string): ReadonlyArray<Graph.SpanRecord> =>
  held.spans.map((spanId) => spanOf(traceId, spanId))

const readGrowing = (state: StoreTable, traceId: string): StoreTable => ({
  ...state,
  grown: { ...state.grown, [traceId]: waitedMillis(state, traceId) + 1 },
})

const readStalling = (state: StoreTable, traceId: string): StoreTable => ({
  ...state,
  answered: { ...state.answered, [traceId]: answeredReads(state, traceId) + 1 },
})

const sourceOver = (table: Ref.Ref<StoreTable>): RemoteObservation.TraceSource<never> => (traceId) =>
  Effect.gen(function*() {
    const state = yield* Ref.get(table)
    const held = state.held.find((entry) => entry.trace === traceId)
    if (held === undefined) return NO_SPANS
    if (held.delivery === 'served') return servedHeld(held, traceId)
    if (held.delivery === 'growing') {
      const counted = yield* Ref.updateAndGet(table, (current) => readGrowing(current, traceId))
      return servedGrowing(counted, traceId)
    }
    const counted = yield* Ref.updateAndGet(table, (current) => readStalling(current, traceId))
    return answeredReads(counted, traceId) === 1 ? servedHeld(held, traceId) : yield* Effect.never
  })

export interface RemoteStoreHandle {
  readonly table: Ref.Ref<StoreTable>
  readonly observation: Context.Context<Observation.Observation>
}

export class RemoteStore extends Context.Service<RemoteStore, RemoteStoreHandle>()(
  '@systemfsoftware/trace-spec/tests/RemoteStore',
) {}

const OPTIONS: RemoteObservation.Options = {
  interval: Duration.millis(1),
  settle: Duration.millis(1),
  timeout: Duration.millis(5),
}
export const remoteStoreLayer: Layer.Layer<RemoteStore> = Layer.effect(
  RemoteStore,
  Effect.gen(function*() {
    const table = yield* Ref.make<StoreTable>({ held: [], grown: {}, answered: {} })
    const observation = yield* Layer.build(RemoteObservation.layer(sourceOver(table), OPTIONS))
    return { table, observation }
  }),
)

const done: TraceResponse = { _tag: 'Done' }

const resetCounters = (state: StoreTable, trace: string): StoreTable => ({
  ...state,
  grown: { ...state.grown, [trace]: 0 },
  answered: { ...state.answered, [trace]: 0 },
})

const freshReads = (state: StoreTable, trace: string): StoreTable => ({
  ...state,
  answered: { ...state.answered, [trace]: 0 },
})

const heldFor = (state: StoreTable, held: Held): StoreTable => ({
  held: [...state.held.filter((entry) => entry.trace !== held.trace), held].toSorted((left, right) =>
    left.trace.localeCompare(right.trace)
  ),
  grown: state.grown,
  answered: state.answered,
})

const recorded = (store: RemoteStoreHandle, held: Held): Effect.Effect<TraceResponse> =>
  Effect.as(Ref.update(store.table, (state) => resetCounters(heldFor(state, held), held.trace)), done)

const forgotten = (store: RemoteStoreHandle, trace: string): Effect.Effect<TraceResponse> =>
  Effect.as(
    Ref.update(store.table, (state) =>
      resetCounters({ ...state, held: state.held.filter((entry) => entry.trace !== trace) }, trace)),
    done,
  )

const responseOf = (
  traceId: string,
  outcome: Result.Result<ReadonlyArray<Graph.SpanRecord>, Observation.ObservationFailure>,
): TraceResponse =>
  Result.isSuccess(outcome)
    ? { _tag: 'Observed', traceId, spanIds: outcome.success.map((span) => span.spanId) }
    : Schema.is(Observation.EmptyObservationError)(outcome.failure)
    ? { _tag: 'Absent', traceId }
    : { _tag: 'Unfinished', traceId }

const observed = (store: RemoteStoreHandle, traceId: string): Effect.Effect<TraceResponse> =>
  Effect.provide(
    Effect.flatMap(Observation.Observation, (collector) =>
      Effect.andThen(
        Ref.update(store.table, (state) => freshReads(state, traceId)),
        Effect.result(collector.collect(traceId)),
      )),
    store.observation,
  ).pipe(Effect.map((outcome) => responseOf(traceId, outcome)))

export const runTraceCommand = (command: TraceCommand): Effect.Effect<TraceResponse, never, RemoteStore> =>
  Effect.flatMap(RemoteStore, (store) =>
    Match.value(command).pipe(
      Match.tagsExhaustive({
        Serve: (serve) => recorded(store, { trace: serve.trace, spans: serve.spans, delivery: 'served' }),
        Grow: (grow) => recorded(store, { trace: grow.trace, spans: [], delivery: 'growing' }),
        Stall: (stall) => recorded(store, { trace: stall.trace, spans: stall.spans, delivery: 'stalling' }),
        Clear: (clear) => forgotten(store, clear.trace),
        Observe: (observe) => observed(store, observe.trace),
      }),
    ))
