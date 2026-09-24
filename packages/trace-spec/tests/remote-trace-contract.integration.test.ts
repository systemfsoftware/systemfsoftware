import { expect } from '@effect/vitest'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Contract, Rel, RemoteObservation, Stimulus, TempoTraceStore } from '@systemfsoftware/trace-spec'
import { Duration, Effect, Encoding, FileSystem, HashMap, Layer, Option, Ref, Result, Schema } from 'effect'
import * as HttpClient from 'effect/unstable/http/HttpClient'
import type { HttpClientError } from 'effect/unstable/http/HttpClientError'
import * as HttpClientRequest from 'effect/unstable/http/HttpClientRequest'
import { HttpServerRequest } from 'effect/unstable/http/HttpServerRequest'
import * as HttpServerResponse from 'effect/unstable/http/HttpServerResponse'
import { Charge, FulfillmentTaxonomy, Settle } from './__fixtures__/fulfillment-trace.schema.js'
import { Loopback, loopbackStore } from './__fixtures__/loopback-store.fixture.js'

/**
 * One loopback server plays both the system under test and the trace store.
 * The settlement pushes its trace context to the store over HTTP; the store
 * records the spans beneath that context and serves them back in Tempo's wire
 * form. The published remote observation layer reads them through the published
 * Tempo source, and the published contract judges the decoded graph — the same
 * contract that holds over an in-memory observation window.
 */

const SETTLE_ROUTE = '/settle'
const TRACES_ROUTE = '/api/v2/traces/'
const ORDER_TOTAL = 9
const CHARGE_SPAN_ID = '00000000000000c1'
const SPAN_START_MILLIS = 1_000
const SPAN_DURATION_MILLIS = 5
const REFUSED_STATUS = 503
const NO_ROWS: ReadonlyArray<Row> = []
const OBSERVATION_OPTIONS: RemoteObservation.Options = {
  interval: Duration.millis(20),
  settle: Duration.millis(60),
  timeout: Duration.millis(2_000),
}

/** How the store serves one trace: normally, refusing the read, answering with junk, or never finished. */
type Serving = 'recorded' | 'refused' | 'malformed' | 'growing'

type AttributeValue = string | number

interface Row {
  readonly spanId: string
  readonly parentSpanId: string | null
  readonly name: string
  readonly startMillis: number
  readonly durationMillis: number
  readonly attributes: Readonly<Record<string, AttributeValue>>
}

interface StoreState {
  readonly rows: Ref.Ref<HashMap.HashMap<string, ReadonlyArray<Row>>>
  readonly modes: Ref.Ref<HashMap.HashMap<string, Serving>>
}

interface Traceparent {
  readonly traceId: string
  readonly spanId: string
}

interface Order {
  readonly orderId: string
  readonly charge: boolean
  readonly mode: Serving
}

type StoreFailure = Contract.JudgeFailure<HttpClientError>

// ---------------------------------------------------------------------------
// Tempo v2 wire form, built by hand: base64 proto ids, nanosecond strings.
// ---------------------------------------------------------------------------

const toBase64 = (hex: string): string => Encoding.encodeBase64(Result.getOrThrow(Encoding.decodeHex(hex)))

const wireValue = (value: AttributeValue): string =>
  typeof value === 'number' ? `{"doubleValue":${value}}` : `{"stringValue":"${value}"}`

const wireAttributes = (attributes: Readonly<Record<string, AttributeValue>>): string =>
  Object.entries(attributes)
    .map(([key, value]) => `{"key":"${key}","value":${wireValue(value)}}`)
    .join(',')

const wireSpan = (traceId: string, row: Row): string => {
  const parent = row.parentSpanId === null ? '' : `,"parentSpanId":"${toBase64(row.parentSpanId)}"`
  const startNanos = row.startMillis * 1_000_000
  const endNanos = (row.startMillis + row.durationMillis) * 1_000_000
  return `{"traceId":"${toBase64(traceId)}","spanId":"${
    toBase64(row.spanId)
  }"${parent},"name":"${row.name}","startTimeUnixNano":"${startNanos}","endTimeUnixNano":"${endNanos}","attributes":[${
    wireAttributes(row.attributes)
  }]}`
}

const wireBody = (traceId: string, rows: ReadonlyArray<Row>): string =>
  `{"trace":{"resourceSpans":[{"scopeSpans":[{"spans":[${rows.map((row) => wireSpan(traceId, row)).join(',')}]}]}]}}`

// ---------------------------------------------------------------------------
// Server state and routes
// ---------------------------------------------------------------------------

const orderAttributes = (orderId: string): Readonly<Record<string, AttributeValue>> => ({
  'app.order.id': orderId,
  'app.order.total': ORDER_TOTAL,
})

const spanRow = (
  name: string,
  spanId: string,
  parentSpanId: string | null,
  attributes: Readonly<Record<string, AttributeValue>>,
): Row => ({
  name,
  spanId,
  parentSpanId,
  attributes,
  startMillis: SPAN_START_MILLIS,
  durationMillis: SPAN_DURATION_MILLIS,
})

const toBase16 = (value: number): string => value.toString(16).padStart(16, '0')

const parseTraceparent = (text: string): Option.Option<Traceparent> => {
  const [version, traceId, spanId, flags] = text.split('-')
  return version === '00' && traceId !== undefined && spanId !== undefined && flags !== undefined
    ? Option.some({ traceId, spanId })
    : Option.none()
}

const servingOf = (value: string | undefined): Serving =>
  value === 'refused' || value === 'malformed' || value === 'growing' ? value : 'recorded'

const traceIdOf = (url: string): string => url.slice(url.lastIndexOf('/') + 1)

const recordSettlement = (
  state: StoreState,
  traceId: string,
  spanId: string,
  orderId: string,
  charge: boolean,
): Effect.Effect<void> =>
  Effect.gen(function*() {
    const attributes = orderAttributes(orderId)
    const rows = charge
      ? [spanRow(Settle.name, spanId, null, attributes), spanRow(Charge.name, CHARGE_SPAN_ID, spanId, attributes)]
      : [spanRow(Settle.name, spanId, null, attributes)]
    yield* Ref.update(state.rows, (current) => HashMap.set(current, traceId, rows))
  })

const appendGrowingSpan = (state: StoreState, traceId: string): Effect.Effect<void> =>
  Effect.gen(function*() {
    const current = yield* Ref.get(state.rows)
    const existing = Option.getOrElse(HashMap.get(current, traceId), () => NO_ROWS)
    const grown = spanRow(Settle.name, toBase16(existing.length), null, orderAttributes(`grown-${existing.length}`))
    yield* Ref.set(state.rows, HashMap.set(current, traceId, [...existing, grown]))
  })

const currentRows = (
  state: StoreState,
  traceId: string,
  mode: Serving,
): Effect.Effect<Option.Option<ReadonlyArray<Row>>> =>
  Effect.gen(function*() {
    if (mode === 'growing') {
      yield* appendGrowingSpan(state, traceId)
    }
    return HashMap.get(yield* Ref.get(state.rows), traceId)
  })

const settleAnswer = (
  request: HttpServerRequest,
  state: StoreState,
): Effect.Effect<HttpServerResponse.HttpServerResponse> =>
  Effect.gen(function*() {
    const parsed = parseTraceparent(request.headers['traceparent'] ?? '')
    if (Option.isNone(parsed)) {
      return HttpServerResponse.text('no trace context', { status: 400 })
    }
    const orderId = request.headers['x-order-id'] ?? ''
    const charge = request.headers['x-order-charge'] === 'true'
    const mode = servingOf(request.headers['x-order-mode'])
    yield* recordSettlement(state, parsed.value.traceId, parsed.value.spanId, orderId, charge)
    if (mode !== 'recorded') {
      yield* Ref.update(state.modes, (current) => HashMap.set(current, parsed.value.traceId, mode))
    }
    return HttpServerResponse.text('recorded', { status: 202 })
  })

const traceAnswer = (
  request: HttpServerRequest,
  state: StoreState,
): Effect.Effect<HttpServerResponse.HttpServerResponse> =>
  Effect.gen(function*() {
    const traceId = traceIdOf(request.url)
    const mode = Option.getOrElse(HashMap.get(yield* Ref.get(state.modes), traceId), (): Serving => 'recorded')
    if (mode === 'refused') {
      return HttpServerResponse.text('the store refused this read', { status: REFUSED_STATUS })
    }
    if (mode === 'malformed') {
      return HttpServerResponse.text('this is not a trace answer', { contentType: 'application/json' })
    }
    return Option.match(yield* currentRows(state, traceId, mode), {
      onNone: () => HttpServerResponse.text('no such trace', { status: 404 }),
      onSome: (rows) => HttpServerResponse.text(wireBody(traceId, rows), { contentType: 'application/json' }),
    })
  })

const answerFor = (
  request: HttpServerRequest,
  state: StoreState,
): Effect.Effect<HttpServerResponse.HttpServerResponse> =>
  request.method === 'POST' && request.url.endsWith(SETTLE_ROUTE)
    ? settleAnswer(request, state)
    : traceAnswer(request, state)

const serveFrom = (state: StoreState) => Effect.flatMap(HttpServerRequest, (request) => answerFor(request, state))

const LoopbackLive = loopbackStore(
  Effect.map(
    Effect.all({
      rows: Ref.make<HashMap.HashMap<string, ReadonlyArray<Row>>>(HashMap.empty()),
      modes: Ref.make<HashMap.HashMap<string, Serving>>(HashMap.empty()),
    }),
    serveFrom,
  ),
)

// ---------------------------------------------------------------------------
// The settlement, judged through the remote layer
// ---------------------------------------------------------------------------

const settleOrder = (
  input: Order,
  traceparent: string,
): Effect.Effect<string, HttpClientError, Loopback | HttpClient.HttpClient> =>
  Effect.gen(function*() {
    const client = yield* HttpClient.HttpClient
    const loopback = yield* Loopback
    const request = HttpClientRequest.post(`${loopback.baseUrl}${SETTLE_ROUTE}`).pipe(
      HttpClientRequest.setHeader('traceparent', traceparent),
      HttpClientRequest.setHeader('x-order-id', input.orderId),
      HttpClientRequest.setHeader('x-order-charge', String(input.charge)),
      HttpClientRequest.setHeader('x-order-mode', input.mode),
    )
    yield* client.execute(request)
    return `settled:${input.orderId}`
  })

const settlement = Stimulus.make({
  name: 'fulfillment.settle',
  run: ({ input, traceparent }: { readonly input: Order; readonly traceparent: string }) =>
    settleOrder(input, traceparent),
})

const chargeBeneathSettlement = Contract.of(FulfillmentTaxonomy)
  .stimulate(settlement)
  .holds(Rel.all(Rel.exists(Settle), Rel.child(Settle, Charge)))

const recordingFileSystem = Layer.effect(
  FileSystem.FileSystem,
  Effect.sync(() => {
    const files = new Map<string, string>()
    return FileSystem.makeNoop({
      makeDirectory: () => Effect.void,
      writeFileString: (path, data) =>
        Effect.sync(() => {
          files.set(path, data)
        }),
      readFileString: (path) => Effect.succeed(files.get(path) ?? ''),
    })
  }),
)

const observationOverLoopback = Layer.unwrap(
  Effect.map(
    Loopback,
    (loopback) => RemoteObservation.layer(TempoTraceStore.source({ baseUrl: loopback.baseUrl }), OBSERVATION_OPTIONS),
  ),
)

const judgingLayer = Layer.provideMerge(
  observationOverLoopback,
  Layer.mergeAll(LoopbackLive, recordingFileSystem),
)

const disparityOf = (failure: Contract.CheckFailure<HttpClientError>): Contract.TraceDisparityError => {
  if (!Schema.is(Contract.TraceDisparityError)(failure)) {
    throw new Error('expected the contract to refuse with a trace disparity')
  }
  return failure
}

const storeFailureOf = (failure: StoreFailure): Contract.TransportObservationError => {
  if (!Schema.is(Contract.TransportObservationError)(failure)) {
    throw new Error('expected the judge to refuse with a store failure')
  }
  return failure
}

const unfinishedOf = (failure: StoreFailure): Contract.IncompleteObservationError => {
  if (!Schema.is(Contract.IncompleteObservationError)(failure)) {
    throw new Error('expected the judge to report the trace as unfinished')
  }
  return failure
}

const Feature = makeFeature({ it, layer })

Feature('Holding a settlement to a trace contract through a remote store')
  .withScenarioLayer(judgingLayer)
  .liveClock()
  .body(({ scenario }) => {
    scenario(
      'A settlement whose charge the store recorded satisfies the contract',
      Gherkin.Do.pipe(
        Given('an order whose settlement charges credit')(
          'order',
          () => Effect.succeed<Order>({ orderId: 'order-41', charge: true, mode: 'recorded' }),
        ),
        When('the settlement is held to the contract')(
          'checked',
          (s) => Contract.check(chargeBeneathSettlement, s.order),
        ),
        Then('the settlement is accepted and its charge is on the same trace')((s) => {
          expect(s.checked.run.output).toBe('settled:order-41')
          expect(s.checked.verdict).toSatisfy(Schema.is(Rel.Hold))
        }),
      ),
    )

    scenario(
      'A settlement the store records without its charge is refused',
      Gherkin.Do.pipe(
        Given('an order whose settlement never charges credit')(
          'order',
          () => Effect.succeed<Order>({ orderId: 'order-42', charge: false, mode: 'recorded' }),
        ),
        When('the settlement is held to the contract')(
          'refusal',
          (s) => Effect.flip(Contract.check(chargeBeneathSettlement, s.order)).pipe(Effect.map(disparityOf)),
        ),
        Then('the refusal names the missing charge and where the trace was written')((s) => {
          expect(s.refusal.relationId).toContain(Charge.id)
          expect(s.refusal.dumpPath).toContain('artifacts/traces/')
        }),
      ),
    )

    scenario(
      'A store that refuses the read is reported before the wait is up',
      Gherkin.Do.pipe(
        Given('an order whose trace the store will refuse to serve')(
          'order',
          () => Effect.succeed<Order>({ orderId: 'order-43', charge: true, mode: 'refused' }),
        ),
        When('the settlement is judged against the contract, timed')(
          'timed',
          (s) =>
            Effect.timed(Effect.flip(Contract.judge(chargeBeneathSettlement, s.order))).pipe(
              Effect.map(([elapsed, failure]) => ({ elapsed, failure: storeFailureOf(failure) })),
            ),
        ),
        Then('the store failure names the refusal and arrives well inside the deadline')((s) => {
          expect(s.timed.failure.detail).toContain(String(REFUSED_STATUS))
          expect(Duration.toMillis(s.timed.elapsed)).toBeLessThan(Duration.toMillis(OBSERVATION_OPTIONS.timeout))
        }),
      ),
    )

    scenario(
      'A store answering with something that is not a trace is reported as unreadable',
      Gherkin.Do.pipe(
        Given('an order whose trace the store answers with something that is not a trace')(
          'order',
          () => Effect.succeed<Order>({ orderId: 'order-44', charge: true, mode: 'malformed' }),
        ),
        When('the settlement is judged against the contract')(
          'outcome',
          (s) => Effect.flip(Contract.judge(chargeBeneathSettlement, s.order)).pipe(Effect.map(storeFailureOf)),
        ),
        Then('the judge reports the answer could not be understood')((s) => {
          expect(s.outcome.detail).toContain('undecodable trace body')
          expect(s.outcome.source).toContain(TRACES_ROUTE)
        }),
      ),
    )

    scenario(
      'A trace the store never finishes writing is reported as unfinished',
      Gherkin.Do.pipe(
        Given('an order whose trace the store keeps extending')(
          'order',
          () => Effect.succeed<Order>({ orderId: 'order-45', charge: true, mode: 'growing' }),
        ),
        When('the settlement is judged against the contract')(
          'outcome',
          (s) => Effect.flip(Contract.judge(chargeBeneathSettlement, s.order)).pipe(Effect.map(unfinishedOf)),
        ),
        Then('the judge reports the trace as unfinished, naming how much of it arrived')((s) => {
          expect(s.outcome.spanCount).toBeGreaterThan(2)
        }),
      ),
    )
  })
