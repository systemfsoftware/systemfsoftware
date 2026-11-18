/**
 * Specifier prefixes of the packages that build, capture or export spans: the OpenTelemetry SDKs and exporters, and
 * Effect's bridge to them. A test that reaches one of these has telemetry as its subject. `@opentelemetry/api` is
 * absent: its types describe a wire context a domain port may carry, and it builds no tracer.
 */
export const TELEMETRY_SPECIFIER_PREFIXES: ReadonlyArray<string> = [
  '@effect/opentelemetry',
  '@opentelemetry/sdk-trace-base',
  '@opentelemetry/sdk-trace-node',
  '@opentelemetry/sdk-trace-web',
  '@opentelemetry/sdk-node',
  '@opentelemetry/exporter-trace-otlp-http',
  '@opentelemetry/exporter-trace-otlp-grpc',
  '@opentelemetry/exporter-trace-otlp-proto',
  '@opentelemetry/otlp-exporter-base',
  '@opentelemetry/otlp-transformer',
]

/**
 * Names that only a reader of exported spans touches: the OTLP trace payload's nesting and an in-memory exporter's
 * read. A test that reads or declares one inspects span export; a string that merely contains one does not.
 */
export const SPAN_WIRE_NAMES: ReadonlyArray<string> = ['resourceSpans', 'scopeSpans', 'getFinishedSpans']

/** The trace-contract harness, which belongs only to a trace suite. */
export const TRACE_SPEC_SPECIFIER = '@systemfsoftware/trace-spec' as const

export const TRACE_SUITE_BASENAME = /\.trace\.test\.[cm]?tsx?$/

export const TRACING_TEST_FIX =
  'assert spans in a `*.trace.test.ts` suite built on @systemfsoftware/trace-spec (ObservationWindow, Span.declare, Contract, Rel); to test a module-private error-handling combinator of a telemetry module, write an in-source `import.meta.vitest` `it.effect.prop` over synthetic outcomes with no tracer' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Reports tracing machinery in a test that is not a trace suite: a test file, or a file under a test tree, that imports an OpenTelemetry SDK, exporter or the Effect bridge to them, imports @systemfsoftware/trace-spec, or builds its own Tracer; and an in-source `import.meta.vitest` block that uses such an import. A test that only runs code which emits spans imports none of these and is never reported.',
  },
  schema: [],
  messages: {
    telemetryInNonTraceTest:
      "Tracing harness '{{specifier}}' is forbidden in {{fileKind}}. Expected: telemetry assertions in a trace suite. Actual: {{actual}}. Fix: {{fix}}.",
  },
} as const
