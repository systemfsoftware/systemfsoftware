import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Observation, OtlpExportSource } from '@systemfsoftware/trace-spec'
import { Context, Effect, Layer, Ref } from 'effect'

const TRACE = '5b8efff798038103d269b633813fc60c'
const TRACE_UPPER = '5B8EFFF798038103D269B633813FC60C'
const OTHER = '0af7651916cd43dd8448eb211c80319c'
const ROOT = 'eee19b7ec3c1b174'
const CHILD = 'eee19b7ec3c1b175'

// Two exports as an OTLP/HTTP JSON exporter pushes them: hex ids, integer enums, times as decimal strings, int
// values as numbers or strings.
const firstBatch = `{"resourceSpans":[{"resource":{"attributes":[]},"scopeSpans":[{"scope":{"name":"x"},"spans":[
{"traceId":"${TRACE}","spanId":"${CHILD}","parentSpanId":"${ROOT}","name":"capture","kind":3,"startTimeUnixNano":"1716235200250000000","endTimeUnixNano":"1716235200400000000","attributes":[{"key":"http.response.status_code","value":{"intValue":502}},{"key":"error.type","value":{"stringValue":"Timeout"}}],"events":[{"name":"retry","timeUnixNano":"1716235200300000000","attributes":[{"key":"attempt","value":{"intValue":"2"}}]}],"status":{"code":2}},
{"traceId":"${OTHER}","spanId":"aaaaaaaaaaaaaaaa","name":"elsewhere","kind":1,"startTimeUnixNano":"1716235200000000000","endTimeUnixNano":"1716235200000000001"}]}]}]}`

const secondBatch = `{"resourceSpans":[{"scopeSpans":[{"spans":[
{"traceId":"${TRACE_UPPER}","spanId":"${ROOT}","parentSpanId":"","name":"order","kind":2,"startTimeUnixNano":"1716235200000000000","endTimeUnixNano":"1716235200500000000","status":{"code":1}}]}]}]}`

/** The bodies a collector the test runs has received, in arrival order. */
class Received
  extends Context.Service<Received, Ref.Ref<ReadonlyArray<string>>>()('tests/otlp-export-source/Received')
{}

const collector = Layer.effect(Received, Ref.make<ReadonlyArray<string>>([]))

const pushed = (bodies: ReadonlyArray<string>) => Received.use((received) => Ref.set(received, bodies))

const readOf = (traceId: string) =>
  OtlpExportSource.source({ name: 'loopback collector', bodies: Received.use(Ref.get) })(traceId)

const Feature = makeFeature({ it })

Feature('Reading the spans an exporter pushed')
  .withScenarioLayer(collector)
  .body(({ scenario }) => {
    scenario(
      'Spans pushed in two batches, one with uppercase ids, come back as the records of their own trace',
      Gherkin.Do.pipe(
        Given('two pushed exports holding two spans of one trace and one span of another')(
          'pushed',
          () => pushed([firstBatch, secondBatch]),
        ),
        When('the trace is read')('spans', () => readOf(TRACE)),
        Then('both spans of that trace, and only they, come back with their ids, kinds dropped and enums read')((
          { spans },
          expect,
        ) =>
          expect(spans.map((span) => ({
            name: span.name,
            spanId: span.spanId,
            parentSpanId: span.parentSpanId,
            status: span.status,
            errorType: span.errorType,
            startMillis: span.startMillis,
            durationMillis: span.durationMillis,
            attributes: span.attributes,
            events: span.events,
          }))).toEqual([
            {
              name: 'capture',
              spanId: CHILD,
              parentSpanId: ROOT,
              status: 'error',
              errorType: 'Timeout',
              startMillis: 1716235200250,
              durationMillis: 150,
              attributes: { 'http.response.status_code': 502, 'error.type': 'Timeout' },
              events: [{ name: 'retry', attributes: { attempt: 2 } }],
            },
            {
              name: 'order',
              spanId: ROOT,
              parentSpanId: null,
              status: 'ok',
              errorType: null,
              startMillis: 1716235200000,
              durationMillis: 500,
              attributes: {},
              events: [],
            },
          ])
        ),
      ),
    )

    scenario(
      'A body that is not a trace export request fails the read as a transport failure naming the collector and the body',
      Gherkin.Do.pipe(
        Given('a good export followed by a body that is not JSON')(
          'pushed',
          () => pushed([secondBatch, 'not an export']),
        ),
        When('the trace is read, then read again with a logs export in place of the bad body')(
          'failures',
          () =>
            Effect.all([
              readOf(TRACE).pipe(Effect.flip),
              pushed([secondBatch, '{"resourceLogs":[]}']).pipe(Effect.andThen(readOf(TRACE)), Effect.flip),
            ]),
        ),
        Then('each read fails naming the collector, the trace and the second body')(({ failures }, expect) =>
          expect(failures.map((failure) => ({
            transport: failure instanceof Observation.TransportObservationError,
            source: 'source' in failure ? failure.source : null,
            traceId: failure.traceId,
            namesTheBody: failure.message.includes('body[1]'),
          }))).toEqual([
            { transport: true, source: 'loopback collector', traceId: TRACE, namesTheBody: true },
            { transport: true, source: 'loopback collector', traceId: TRACE, namesTheBody: true },
          ])
        ),
      ),
    )
  })
