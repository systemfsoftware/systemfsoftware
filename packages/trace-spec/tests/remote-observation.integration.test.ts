import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Graph, Observation, RemoteObservation } from '@systemfsoftware/trace-spec'
import { Array as Arr, Duration, Effect, Fiber, Layer, Ref, Result } from 'effect'
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

const refusedBeforeRead = {
  _tag: 'Failure',
  cause: { reasons: [{ _tag: 'Die' }] },
} as const

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
        Then('the reader answers with both spans, never the checkout span alone')((s, expect) =>
          expect(s.reading.outcome).toMatchObject({ success: [checkout, payment] })
        ),
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
        Then('the reader reports the trace as absent and names the trace it was asked for')((s, expect) =>
          expect(s.reading).toMatchObject({
            outcome: { _tag: 'Failure', failure: { _tag: 'EmptyObservationError', traceId: TRACE_ID } },
          })
        ),
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
        Then("the reader hands back the store's refusal as it happened, having asked exactly once")((s, expect) =>
          expect(s.reading).toMatchObject({
            served: 1,
            outcome: {
              _tag: 'Failure',
              failure: {
                _tag: 'TransportObservationError',
                traceId: outage.traceId,
                source: outage.source,
                detail: outage.detail,
              },
            },
          })
        ),
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
        Then('the reader reports the trace as unfinished, counting every span the store served')((s, expect) =>
          expect(s.reading).toMatchObject({
            outcome: { _tag: 'Failure', failure: { _tag: 'IncompleteObservationError', spanCount: 5 } },
          })
        ),
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
        Then('the reader reports the trace as unfinished with the one span it saw, after asking twice')((s, expect) =>
          expect(s.reading).toMatchObject({
            served: 2,
            outcome: { _tag: 'Failure', failure: { _tag: 'IncompleteObservationError', spanCount: 1 } },
          })
        ),
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
        Then('the reader reports the trace as unfinished, counting every span the store served')((s, expect) =>
          expect(s.reading).toMatchObject({
            outcome: { _tag: 'Failure', failure: { _tag: 'IncompleteObservationError', spanCount: 4 } },
          })
        ),
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
        Then('the reader asks the store once and reports the trace as unfinished')((s, expect) =>
          expect(s.reading).toMatchObject({
            served: 1,
            outcome: { _tag: 'Failure', failure: { _tag: 'IncompleteObservationError' } },
          })
        ),
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
        Then('every one of them is refused before the store is asked')((s, expect) =>
          expect(s.builds).toMatchObject([refusedBeforeRead, refusedBeforeRead])
        ),
      ),
    )
  })
