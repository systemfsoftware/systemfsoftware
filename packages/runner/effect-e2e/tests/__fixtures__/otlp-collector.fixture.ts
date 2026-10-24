import { OtlpTelemetry } from '@systemfsoftware/effect-e2e/run'
import * as ConfigProvider from 'effect/ConfigProvider'
import * as Effect from 'effect/Effect'
import * as FetchHttpClient from 'effect/http/FetchHttpClient'
import * as Layer from 'effect/Layer'
import * as Metric from 'effect/Metric'
import type * as Schema from 'effect/Schema'

import { metricsOf, type ReceivedMetric, type ReceivedSpan, spansOf } from './otlp-body.schema.js'
import { otlpReceiver } from './otlp-receiver.fixture.js'

export interface Collected<A> {
  readonly value: A
  readonly spans: ReadonlyArray<ReceivedSpan>
  readonly metrics: ReadonlyArray<ReceivedMetric>
  readonly bodies: ReadonlyArray<string>
}

const decodedAll = <B>(
  bodies: ReadonlyArray<string>,
  decode: (body: string) => Effect.Effect<ReadonlyArray<B>, Schema.SchemaError>,
): Effect.Effect<ReadonlyArray<B>, Schema.SchemaError> =>
  Effect.map(Effect.forEach(bodies, decode), (each) => each.flat())

export const collected =
  (registry: Metric.MetricRegistry) =>
  <A, E>(program: Effect.Effect<A, E>): Effect.Effect<Collected<A>, E | Schema.SchemaError> =>
    Effect.scoped(Effect.gen(function*() {
      const receiver = yield* otlpReceiver
      const value = yield* Effect.scoped(Effect.gen(function*() {
        const context = yield* Layer.build(OtlpTelemetry.layerFromEnv.pipe(Layer.provide(FetchHttpClient.layer))).pipe(
          Effect.provideService(
            ConfigProvider.ConfigProvider,
            ConfigProvider.fromEnv({ env: { OTEL_EXPORTER_OTLP_ENDPOINT: receiver.origin } }),
          ),
        )
        return yield* Effect.provide(program, context)
      })).pipe(Effect.provideService(Metric.MetricRegistry, registry))
      const exports = yield* receiver.exports
      const bodiesAt = (path: string) => exports.filter((each) => each.path === path).map((each) => each.body)
      return {
        value,
        spans: yield* decodedAll(bodiesAt('/v1/traces'), spansOf),
        metrics: yield* decodedAll(bodiesAt('/v1/metrics'), metricsOf),
        bodies: exports.map((each) => each.body),
      }
    }))
