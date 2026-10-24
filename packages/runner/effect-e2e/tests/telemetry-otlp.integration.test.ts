import { OtlpTelemetry, Telemetry, type TelemetryShape } from '@systemfsoftware/effect-e2e/run'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import * as ConfigProvider from 'effect/ConfigProvider'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as FetchHttpClient from 'effect/http/FetchHttpClient'
import * as HttpClient from 'effect/http/HttpClient'
import * as Layer from 'effect/Layer'
import * as Metric from 'effect/Metric'

import { metricsOf, type ReceivedMetric, spansOf } from './__fixtures__/otlp-body.schema.js'
import type { OtlpReceiver, ReceivedExport } from './__fixtures__/otlp-receiver.fixture.js'
import { otlpReceiver } from './__fixtures__/otlp-receiver.fixture.js'

const Feature = makeFeature({ it })

const sumOf = (
  metrics: ReadonlyArray<ReceivedMetric>,
  name: string,
  attribute: string,
  value: string | number | boolean,
): number =>
  metrics
    .filter((metric) => metric.name === name)
    .flatMap((metric) => metric.points)
    .filter((point) => attribute === '' || point.attributes[attribute] === value)
    .reduce((total, point) => total + point.value, 0)

const stepWork = (telemetry: TelemetryShape) =>
  telemetry.span(
    'e2e.act',
    { 'e2e.test': 'login-flow', 'e2e.target': 'web', 'e2e.step.index': 0 },
    (span) =>
      Effect.gen(function*() {
        span.set('e2e.cache.outcome', 'missed')
        span.set('e2e.model.calls', 1)
        span.set('e2e.tokens.input', 120)
        span.set('e2e.tokens.output', 8)
        yield* telemetry.count({ _tag: 'ReplayOutcome', outcome: 'missed' })
        yield* telemetry.count({ _tag: 'ModelCall' })
        yield* telemetry.count({ _tag: 'ModelTokens', kind: 'input', tokens: 120 })
        yield* telemetry.count({ _tag: 'ModelTokens', kind: 'output', tokens: 8 })
      }),
  )

const ranWith = (
  collector: OtlpReceiver,
  endpoint: string,
  registry: Metric.MetricRegistry,
): Effect.Effect<ReadonlyArray<ReceivedExport>> =>
  Effect.scoped(Effect.gen(function*() {
    const context = yield* Layer.build(OtlpTelemetry.layerFromEnv.pipe(Layer.provide(FetchHttpClient.layer))).pipe(
      Effect.provideService(
        ConfigProvider.ConfigProvider,
        ConfigProvider.fromEnv({ env: { OTEL_EXPORTER_OTLP_ENDPOINT: endpoint } }),
      ),
      Effect.provideService(Metric.MetricRegistry, registry),
    )
    yield* stepWork(Context.get(context, Telemetry)).pipe(
      Effect.provide(context),
      Effect.provideService(Metric.MetricRegistry, registry),
    )
  })).pipe(Effect.andThen(() => collector.exports))

Feature('Exporting a run to the collector its endpoint names')
  .withLayer(Layer.empty)
  .live('every scenario talks to a real loopback OTLP receiver or a real HTTP client')
  .body(({ scenario }) => {
    scenario(
      'The collector receives a step span with every attribute and the counters its events fed',
      Gherkin.Do.pipe(
        Given('a receiver listening on the loopback')('collector', () => otlpReceiver),
        When('a run with the endpoint pointing at the receiver spans a step and counts its events')(
          'received',
          ({ collector }) => {
            const registry: Metric.MetricRegistry = new Map()
            return Effect.flatMap(ranWith(collector, collector.origin, registry), (exports) =>
              Effect.all({
                raw: Effect.succeed(exports.map((each) => each.path).join('|')),
                traces: Effect.map(
                  spansOf(exports.find((each) => each.path === '/v1/traces')?.body ?? '{}'),
                  (spans) => spans.map((span) => ({ name: span.name, attributes: span.attributes })),
                ),
                metrics: metricsOf(exports.find((each) => each.path === '/v1/metrics')?.body ?? '{}'),
              }))
          },
        ),
        Then('the span with its attributes arrived, and every counter holds its event')((s, expect) =>
          expect({
            paths: s.received.raw,
            spans: s.received.traces.map((span) => span.name),
            attributes: s.received.traces[0]?.attributes,
            replayMissed: sumOf(s.received.metrics, 'e2e.replay.outcomes', 'outcome', 'missed'),
            modelCalls: sumOf(s.received.metrics, 'e2e.model.calls', '', ''),
            tokensIn: sumOf(s.received.metrics, 'e2e.model.tokens', 'kind', 'input'),
            tokensOut: sumOf(s.received.metrics, 'e2e.model.tokens', 'kind', 'output'),
          }).toEqual({
            paths: '/v1/metrics|/v1/traces',
            spans: ['e2e.act'],
            attributes: {
              'e2e.test': 'login-flow',
              'e2e.target': 'web',
              'e2e.step.index': 0,
              'e2e.cache.outcome': 'missed',
              'e2e.model.calls': 1,
              'e2e.tokens.input': 120,
              'e2e.tokens.output': 8,
            },
            replayMissed: 1,
            modelCalls: 1,
            tokensIn: 120,
            tokensOut: 8,
          })
        ),
      ),
    )

    scenario(
      'A collector mounted under a path receives each signal below that path',
      Gherkin.Do.pipe(
        Given('a receiver listening on the loopback')('collector', () => otlpReceiver),
        When('a run whose endpoint names a path under the receiver spans a step')('paths', ({ collector }) => {
          const registry: Metric.MetricRegistry = new Map()
          return Effect.map(
            ranWith(collector, `${collector.origin}/collector`, registry),
            (exports) => exports.map((each) => each.path),
          )
        }),
        Then('each signal arrived below the configured path')((s, expect) =>
          expect(s.paths).toEqual(['/collector/v1/metrics', '/collector/v1/traces'])
        ),
      ),
    )

    scenario(
      'A run with no endpoint configured sends nothing at all',
      Gherkin.Do.pipe(
        Given('a network monitor that records every request it is ever asked to send')('monitor', () => {
          const requests: Array<string> = []
          const client: HttpClient.HttpClient = HttpClient.make((request) =>
            Effect.sync(() => requests.push(request.url)).pipe(
              Effect.andThen(() => Effect.die('the network monitor observed telemetry egress')),
            )
          )
          return Effect.succeed({ requests, client })
        }),
        When('a run with no endpoint spans a step and counts its events')('silent', ({ monitor }) => {
          const registry: Metric.MetricRegistry = new Map()
          return Effect.scoped(Effect.gen(function*() {
            const context = yield* Layer.build(OtlpTelemetry.layerFromEnv).pipe(
              Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromEnv({ env: {} })),
              Effect.provideService(Metric.MetricRegistry, registry),
              Effect.provideService(HttpClient.HttpClient, monitor.client),
            )
            yield* stepWork(Context.get(context, Telemetry)).pipe(
              Effect.provide(context),
              Effect.provideService(Metric.MetricRegistry, registry),
            )
          })).pipe(Effect.andThen(() => Effect.sync(() => [...monitor.requests])))
        }),
        Then('the monitor was asked for nothing')((s, expect) => expect(s.silent).toEqual([])),
      ),
    )
  })
