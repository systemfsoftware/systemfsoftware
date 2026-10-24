import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import type { TelemetryCount } from './telemetry.schema.js'

/** What one span attribute may carry: the shapes OTLP serialises (design §14). */
export type TelemetryAttributeValue = string | number | boolean | ReadonlyArray<string>

/** The span the wiring may add completion attributes to; inert when telemetry is off. */
export interface TelemetrySpan {
  readonly set: (key: string, value: TelemetryAttributeValue) => void
}

export type { TelemetryCount } from './telemetry.schema.js'

/** Opens a span around `use` (design §14): observation only, so the wrapped effect's value, error, and
 * requirement channels pass through unchanged and a failing step's `Exit` is what it would be without
 * instrumentation.
 */
export interface TelemetrySpanFn {
  <A, E, R>(
    name: string,
    attributes: Readonly<Record<string, TelemetryAttributeValue>>,
    use: (span: TelemetrySpan) => Effect.Effect<A, E, R>,
  ): Effect.Effect<A, E, R>
}

/** Where a run's spans and counters go (design §5, §14). */
export interface TelemetryShape {
  readonly span: TelemetrySpanFn
  /** Adds one event to the counter design §14 names for it; a no-op unless the OTLP layer is active. */
  readonly count: (event: TelemetryCount) => Effect.Effect<void>
}

const SILENT_SPAN: TelemetrySpan = { set: () => undefined }

const SILENT: TelemetryShape = {
  span: (_name, _attributes, use) => use(SILENT_SPAN),
  count: () => Effect.void,
}

/**
 * The run's telemetry sink (design §14): `noop` unless the composition root selects the OTLP layer, so
 * nothing is sent anywhere by default (requirements FR-11).
 */
export class Telemetry extends Context.Service<Telemetry, TelemetryShape>()(
  '@systemfsoftware/effect-e2e/run/Telemetry',
) {
  /** The default sink: no span, no counter, no egress. */
  static readonly noop: Layer.Layer<Telemetry> = Layer.succeed(this)(SILENT)
}
