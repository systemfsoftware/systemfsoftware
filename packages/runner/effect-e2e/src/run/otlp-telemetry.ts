import * as Config from 'effect/Config'
import * as Effect from 'effect/Effect'
import * as HttpClient from 'effect/http/HttpClient'
import * as Layer from 'effect/Layer'
import * as Match from 'effect/Match'
import * as Metric from 'effect/Metric'
import * as OtlpMetrics from 'effect/observability/OtlpMetrics'
import * as OtlpSerialization from 'effect/observability/OtlpSerialization'
import * as OtlpTracer from 'effect/observability/OtlpTracer'
import * as Option from 'effect/Option'
import * as Tracer from 'effect/Tracer'

import { Telemetry, type TelemetryShape } from './telemetry.service.js'

/** The resource every exported span and metric names (design §14). */
const RESOURCE = { serviceName: 'effect-e2e' }

/**
 * Counters carry no description: Effect keys an instrument by type, name, description and attributes,
 * so a description would fork the series a reader exports.
 */
const REPLAY_OUTCOMES = {
  replayed: Metric.counter('e2e.replay.outcomes', { incremental: true, attributes: { outcome: 'replayed' } }),
  handed_off: Metric.counter('e2e.replay.outcomes', { incremental: true, attributes: { outcome: 'handed_off' } }),
  missed: Metric.counter('e2e.replay.outcomes', { incremental: true, attributes: { outcome: 'missed' } }),
} as const

const MODEL_CALLS = Metric.counter('e2e.model.calls', { incremental: true })

const MODEL_TOKENS = {
  input: Metric.counter('e2e.model.tokens', { incremental: true, attributes: { kind: 'input' } }),
  output: Metric.counter('e2e.model.tokens', { incremental: true, attributes: { kind: 'output' } }),
} as const

/** Opens spans through the tracer the context carries, so `useSpan` never touches the causes it wraps. */
const OTLP: TelemetryShape = {
  span: (name, attributes, use) =>
    Effect.useSpan(name, { attributes: { ...attributes } }, (span) =>
      Effect.provideService(
        use({ set: (key, value) => span.attribute(key, value) }),
        Tracer.ParentSpan,
        span,
      )),
  count: (event) =>
    Match.value(event).pipe(
      Match.tag('ReplayOutcome', ({ outcome }) => Metric.update(REPLAY_OUTCOMES[outcome], 1)),
      Match.tag('ModelCall', () => Metric.update(MODEL_CALLS, 1)),
      Match.orElse(({ kind, tokens }) => Metric.update(MODEL_TOKENS[kind], tokens)),
    ),
}

/** The sink alone: spans ride the tracer the context already carries, counters update native metrics. Compose `layerFromEnv` to export them. */
export const layer: Layer.Layer<Telemetry> = Layer.succeed(Telemetry)(OTLP)

const signalUrl = (endpoint: URL, signal: 'traces' | 'metrics'): string => {
  const url = new URL(endpoint.toString())
  const slash = url.pathname.endsWith('/') ? '' : '/'
  url.pathname = `${url.pathname}${slash}v1/${signal}`
  return url.toString()
}

const transport = (endpoint: URL): Layer.Layer<never, never, HttpClient.HttpClient> =>
  Layer.mergeAll(
    OtlpTracer.layer({ url: signalUrl(endpoint, 'traces'), resource: RESOURCE }),
    OtlpMetrics.layer({ url: signalUrl(endpoint, 'metrics'), resource: RESOURCE }),
  ).pipe(Layer.provide(OtlpSerialization.layerJson))

/**
 * The OTLP layer, selected only when `OTEL_EXPORTER_OTLP_ENDPOINT` is set, over the `HttpClient` the
 * edge provides; the noop layer otherwise, so nothing is composed and nothing leaves the process
 * (design §14, requirements FR-11).
 */
export const layerFromEnv: Layer.Layer<Telemetry, never, HttpClient.HttpClient> = Config.option(
  Config.URL('OTEL_EXPORTER_OTLP_ENDPOINT'),
).pipe(
  Effect.map((endpoint) =>
    Option.match(endpoint, {
      onNone: () => Telemetry.noop,
      onSome: (url) => Layer.mergeAll(transport(url), layer),
    })
  ),
  Effect.orDie,
  Layer.unwrap,
)
