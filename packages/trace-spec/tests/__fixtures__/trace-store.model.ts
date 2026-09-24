import { Match, Schema } from 'effect'

export const TraceId = Schema.Literals(['trace-a', 'trace-b'])

export const SpanId = Schema.Literals(['span-1', 'span-2', 'span-3'])

export const TraceCommand = Schema.Union([
  Schema.TaggedStruct('Serve', { trace: TraceId, spans: Schema.Array(SpanId) }),
  Schema.TaggedStruct('Grow', { trace: TraceId }),
  Schema.TaggedStruct('Stall', { trace: TraceId, spans: Schema.Array(SpanId) }),
  Schema.TaggedStruct('Clear', { trace: TraceId }),
  Schema.TaggedStruct('Observe', { trace: TraceId }),
])
export type TraceCommand = Schema.Schema.Type<typeof TraceCommand>

export type TraceResponse =
  | { readonly _tag: 'Done' }
  | { readonly _tag: 'Observed'; readonly traceId: string; readonly spanIds: ReadonlyArray<string> }
  | { readonly _tag: 'Absent'; readonly traceId: string }
  | { readonly _tag: 'Unfinished'; readonly traceId: string }

const Delivery = Schema.Literals(['served', 'growing', 'stalling'])

const Held = Schema.Struct({
  trace: TraceId,
  spans: Schema.Array(SpanId),
  delivery: Delivery,
})

export const StoreState = Schema.Struct({ held: Schema.Array(Held) })
export type StoreState = Schema.Schema.Type<typeof StoreState>

type Step = readonly [StoreState, TraceResponse]

const heldAt = (state: StoreState, trace: string): StoreState['held'][number] | undefined =>
  state.held.find((entry) => entry.trace === trace)

const withHeld = (state: StoreState, held: StoreState['held'][number]): StoreState => ({
  ...state,
  held: [...state.held.filter((entry) => entry.trace !== held.trace), held].toSorted((left, right) =>
    left.trace.localeCompare(right.trace)
  ),
})

const withoutHeld = (state: StoreState, trace: string): StoreState => ({
  ...state,
  held: state.held.filter((entry) => entry.trace !== trace),
})

const firstOfEach = (spans: ReadonlyArray<string>): ReadonlyArray<string> => [...new Set(spans)]

const answered = (state: StoreState, trace: string): TraceResponse => {
  const held = heldAt(state, trace)
  if (held === undefined) return { _tag: 'Absent', traceId: trace }
  if (held.delivery === 'growing') return { _tag: 'Unfinished', traceId: trace }
  if (held.delivery === 'stalling') {
    return held.spans.length === 0 ? { _tag: 'Absent', traceId: trace } : { _tag: 'Unfinished', traceId: trace }
  }
  return held.spans.length === 0
    ? { _tag: 'Absent', traceId: trace }
    : { _tag: 'Observed', traceId: trace, spanIds: firstOfEach(held.spans) }
}

const done: TraceResponse = { _tag: 'Done' }

const stepped = (state: StoreState, command: TraceCommand): Step =>
  Match.value(command).pipe(
    Match.tagsExhaustive({
      Serve: (serve): Step => [withHeld(state, { trace: serve.trace, spans: serve.spans, delivery: 'served' }), done],
      Grow: (grow): Step => [withHeld(state, { trace: grow.trace, spans: [], delivery: 'growing' }), done],
      Stall: (stall): Step => [withHeld(state, { trace: stall.trace, spans: stall.spans, delivery: 'stalling' }), done],
      Clear: (clear): Step => [withoutHeld(state, clear.trace), done],
      Observe: (observe): Step => [state, answered(state, observe.trace)],
    }),
  )

const mayRun = (state: StoreState, command: TraceCommand): boolean =>
  Match.value(command).pipe(
    Match.tag('Clear', (clear) => heldAt(state, clear.trace) !== undefined),
    Match.orElse(() => true),
  )

export const traceStoreModel = {
  state: StoreState,
  initial: { held: [] } satisfies StoreState,
  precondition: mayRun,
  step: stepped,
}
