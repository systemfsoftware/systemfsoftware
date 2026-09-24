import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Graph, Observation, RemoteObservation } from '@systemfsoftware/trace-spec'
import { expect } from '@systemfsoftware/vitest'
import { Array as Arr, Cause, Duration, Effect, Exit, Fiber, Layer, Option, Ref, Result, Schema } from 'effect'
import { TestClock } from 'effect/testing'

const Feature = makeFeature({ it })

const TRACE_ID = '0af7651916cd43dd8448eb211c80319c'
const CHECKOUT_SPAN_ID = '5b8efff798038c10355db7e76c83f5b1'
const PAYMENT_SPAN_ID = 'eee19b7ec3c51b35'

const NO_SPANS: ReadonlyArray<Graph.SpanRecord> = []

const checkout: Graph.SpanRecord = {
  traceId: TRACE_ID,
  spanId: CHECKOUT_SPAN_ID,
  parentSpanId: null,
  name: 'checkout.place-order',
  status: 'ok',
  errorType: null,
  startMillis: 0,
  durationMillis: 40,
  attributes: {},
  events: [],
  links: [],
}

const payment: Graph.SpanRecord = {
  traceId: TRACE_ID,
  spanId: PAYMENT_SPAN_ID,
  parentSpanId: CHECKOUT_SPAN_ID,
  name: 'checkout.capture-payment',
  status: 'ok',
  errorType: null,
  startMillis: 4,
  durationMillis: 30,
  attributes: {},
  events: [],
  links: [],
}

const outage = new Observation.TransportObservationError({
  traceId: TRACE_ID,
  source: 'the scripted store',
  detail: 'the store refused the read',
})

type ReadFailure = Observation.IncompleteObservationError | Observation.TransportObservationError

type Script = (read: number) => Effect.Effect<ReadonlyArray<Graph.SpanRecord>, ReadFailure>

interface Store {
  readonly script: Script
  readonly options: RemoteObservation.Options
}

const storeOf = (script: Script, options: RemoteObservation.Options): Effect.Effect<Store> =>
  Effect.succeed({ script, options })

const store = (script: Script, reads: Ref.Ref<number>): RemoteObservation.TraceSource<never> => (_traceId) =>
  Effect.flatMap(Ref.getAndUpdate(reads, (count) => count + 1), (read) => script(read))

interface Reading {
  readonly outcome: Result.Result<ReadonlyArray<Graph.SpanRecord>, Observation.ObservationFailure>
  readonly served: number
}

const readBack = (script: Script, options: RemoteObservation.Options): Effect.Effect<Reading> =>
  Effect.gen(function*() {
    const reads = yield* Ref.make(0)
    const reader = RemoteObservation.layer(store(script, reads), options)
    const asked = yield* Effect.forkChild(
      Effect.flatMap(Observation.Observation, (observation) => observation.collect(TRACE_ID)).pipe(
        Effect.provide(reader),
      ),
    )
    yield* TestClock.adjust(Duration.seconds(10))
    const outcome = yield* Effect.result(Fiber.join(asked))
    return { outcome, served: yield* Ref.get(reads) }
  })

const buildWith = (options: RemoteObservation.Options) =>
  Effect.exit(
    Effect.provide(
      Effect.flatMap(Observation.Observation, (observation) => observation.collect(TRACE_ID)),
      RemoteObservation.layer(() => Effect.succeed(NO_SPANS), options),
    ),
  )

const constructionRefused = (
  outcome: Exit.Exit<ReadonlyArray<Graph.SpanRecord>, Observation.ObservationFailure>,
): boolean => Exit.isFailure(outcome) && Cause.hasDies(outcome.cause)

const failureOf = (reading: Reading): Option.Option<Observation.ObservationFailure> =>
  Result.isFailure(reading.outcome) ? Option.some(reading.outcome.failure) : Option.none()

const isAbsentFailure = Schema.is(Observation.EmptyObservationError)

const isUnfinishedFailure = Schema.is(Observation.IncompleteObservationError)

const reportsAbsence = (reading: Reading): boolean => Option.exists(failureOf(reading), isAbsentFailure)

const reportsUnfinished = (reading: Reading): boolean => Option.exists(failureOf(reading), isUnfinishedFailure)

const namedTrace = (reading: Reading): string =>
  Option.match(failureOf(reading), { onNone: () => '', onSome: (failure) => failure.traceId })

const countedSpans = (reading: Reading): number =>
  Option.match(failureOf(reading), {
    onNone: () => 0,
    onSome: (failure) => (isUnfinishedFailure(failure) ? failure.spanCount : 0),
  })

const spanIdsOf = (spans: ReadonlyArray<Graph.SpanRecord>): ReadonlyArray<string> => spans.map((span) => span.spanId)

const growingSpan = (index: number): Graph.SpanRecord => ({ ...checkout, spanId: `growing-span-${index}` })

const growsEveryRead: Script = (read) => Effect.succeed(Arr.range(0, read).map((index) => growingSpan(index)))

Feature('Reading a finished trace back from a remote store')
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'A span that arrives while the reader is still watching ends up in the settled trace',
      Gherkin.Do.pipe(
        Given('a remote store that serves the checkout span first and the payment span only from the fourth read')(
          'late',
          () =>
            storeOf(
              (read) => Effect.succeed(read < 3 ? [checkout] : [checkout, payment]),
              { interval: Duration.millis(20), settle: Duration.millis(100), timeout: Duration.millis(1000) },
            ),
        ),
        When('the finished trace is read back')('reading', (s) => readBack(s.late.script, s.late.options)),
        Then('the reader answers with both spans, never the checkout span alone')((s) => {
          expect(s.reading.outcome).toSatisfy(Result.isSuccess)
          expect(spanIdsOf(Result.getOrThrow(s.reading.outcome))).toStrictEqual([CHECKOUT_SPAN_ID, PAYMENT_SPAN_ID])
        }),
      ),
    )

    scenario(
      'A trace the store never received is reported as absent, naming the trace',
      Gherkin.Do.pipe(
        Given('a remote store that holds nothing')(
          'barren',
          () =>
            storeOf(
              () => Effect.succeed(NO_SPANS),
              { interval: Duration.millis(20), settle: Duration.millis(100), timeout: Duration.millis(200) },
            ),
        ),
        When('the finished trace is read back')('reading', (s) => readBack(s.barren.script, s.barren.options)),
        Then('the reader reports the trace as absent and names the trace it was asked for')((s) => {
          expect(s.reading).toSatisfy(reportsAbsence)
          expect(namedTrace(s.reading)).toBe(TRACE_ID)
        }),
      ),
    )

    scenario(
      'A store that refuses the first read ends the reading right there',
      Gherkin.Do.pipe(
        Given('a remote store whose first read is refused')(
          'refusing',
          () =>
            storeOf(
              (read) => (read === 0 ? Effect.fail(outage) : Effect.succeed([checkout])),
              { interval: Duration.millis(20), settle: Duration.millis(100), timeout: Duration.millis(1000) },
            ),
        ),
        When('the finished trace is read back')('reading', (s) => readBack(s.refusing.script, s.refusing.options)),
        Then("the reader hands back the store's refusal as it happened, having asked exactly once")((s) => {
          expect(failureOf(s.reading)).toStrictEqual(Option.some(outage))
          expect(s.reading.served).toBe(1)
        }),
      ),
    )

    scenario(
      'A trace that keeps growing is reported as unfinished rather than answered in part',
      Gherkin.Do.pipe(
        Given('a remote store that serves one more span on every read')(
          'growing',
          () =>
            storeOf(
              growsEveryRead,
              { interval: Duration.millis(20), settle: Duration.millis(50), timeout: Duration.millis(100) },
            ),
        ),
        When('the finished trace is read back')('reading', (s) => readBack(s.growing.script, s.growing.options)),
        Then('the reader reports the trace as unfinished, counting every span the store served')((s) => {
          expect(s.reading).toSatisfy(reportsUnfinished)
          expect(countedSpans(s.reading)).toBe(5)
        }),
      ),
    )

    scenario(
      'A store that stops answering in the middle of a read is reported when the wait is up',
      Gherkin.Do.pipe(
        Given('a remote store that serves the checkout span once and then never answers again')(
          'stalled',
          () =>
            storeOf(
              (read) => (read === 0 ? Effect.succeed([checkout]) : Effect.never),
              { interval: Duration.millis(20), settle: Duration.millis(100), timeout: Duration.millis(200) },
            ),
        ),
        When('the finished trace is read back')('reading', (s) => readBack(s.stalled.script, s.stalled.options)),
        Then('the reader reports the trace as unfinished with the one span it saw, after asking twice')((s) => {
          expect(s.reading).toSatisfy(reportsUnfinished)
          expect(countedSpans(s.reading)).toBe(1)
          expect(s.reading.served).toBe(2)
        }),
      ),
    )

    scenario(
      'A trace still growing between reads spaced wider than the quiet window is not taken as finished',
      Gherkin.Do.pipe(
        Given('a remote store that serves one more span on every read, read less often than its quiet window')(
          'sparse',
          () =>
            storeOf(
              growsEveryRead,
              { interval: Duration.millis(80), settle: Duration.millis(50), timeout: Duration.millis(300) },
            ),
        ),
        When('the finished trace is read back')('reading', (s) => readBack(s.sparse.script, s.sparse.options)),
        Then('the reader reports the trace as unfinished, counting every span the store served')((s) => {
          expect(s.reading).toSatisfy(reportsUnfinished)
          expect(countedSpans(s.reading)).toBe(4)
        }),
      ),
    )

    scenario(
      'A reader whose wait between reads outlasts its deadline stops after one read',
      Gherkin.Do.pipe(
        Given('a remote store read more slowly than the whole reading may take')(
          'spaced',
          () =>
            storeOf(
              () => Effect.succeed([checkout]),
              { interval: Duration.millis(300), settle: Duration.millis(500), timeout: Duration.millis(200) },
            ),
        ),
        When('the finished trace is read back')('reading', (s) => readBack(s.spaced.script, s.spaced.options)),
        Then('the reader asks the store once and reports the trace as unfinished')((s) => {
          expect(s.reading.served).toBe(1)
          expect(s.reading).toSatisfy(reportsUnfinished)
        }),
      ),
    )

    scenario(
      'A reader asked to wait for nothing at all is refused before it reads anything',
      Gherkin.Do.pipe(
        Given('cadences that wait for nothing: an interval of zero and a quiet window below zero')(
          'impatient',
          () =>
            Effect.succeed([
              { interval: Duration.zero, settle: Duration.millis(10), timeout: Duration.millis(100) },
              { interval: Duration.millis(10), settle: Duration.millis(-1), timeout: Duration.millis(100) },
            ]),
        ),
        When('the reader is built with each of them')('builds', (s) => Effect.forEach(s.impatient, buildWith)),
        Then('every one of them is refused before the store is asked')((s) => {
          expect(s.builds).toSatisfy(
            (builds: ReadonlyArray<Exit.Exit<ReadonlyArray<Graph.SpanRecord>, Observation.ObservationFailure>>) =>
              builds.every(constructionRefused),
          )
        }),
      ),
    )
  })
