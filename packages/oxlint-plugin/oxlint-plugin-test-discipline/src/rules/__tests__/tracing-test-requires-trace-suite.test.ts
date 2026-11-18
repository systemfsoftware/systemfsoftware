import { TRACING_TEST_FIX } from '../tracing-test-requires-trace-suite.config.js'
import { tracingTestRequiresTraceSuite } from '../tracing-test-requires-trace-suite.js'
import { createRuleTester } from './_tester.js'

const ruleTester = createRuleTester()

const INTEGRATION = '/repo/pkg/tests/a-flush-never-fails.integration.test.ts'
const PLAIN_TEST = '/repo/pkg/tests/flush.test.ts'
const FIXTURE = '/repo/pkg/tests/__fixtures__/otel.ts'
const TRACE = '/repo/pkg/tests/a-cycle-keeps-its-secrets.trace.test.ts'
const SOURCE = '/repo/pkg/src/otlp-tracer.ts'

const NOT_TRACE = 'a test that is not a trace suite'
const IN_SOURCE = 'an in-source `import.meta.vitest` block'

const error = (specifier: string, fileKind: string, actual: string) => ({
  messageId: 'telemetryInNonTraceTest' as const,
  data: { specifier, fileKind, actual, fix: TRACING_TEST_FIX },
})

const imports = (specifier: string) =>
  error(specifier, NOT_TRACE, `this file imports '${specifier}', which builds or exports spans`)

const BUILDS_TRACER = error('effect/Tracer', NOT_TRACE, 'this test builds or provides its own Tracer')

ruleTester.run('tracing-test-requires-trace-suite', tracingTestRequiresTraceSuite, {
  valid: [
    {
      name: 'Should_Pass_When_TraceSuiteImportsTraceSpecAndTheSdk',
      code:
        `import { ObservationWindow, Rel } from '@systemfsoftware/trace-spec'\nimport { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base'\n`,
      filename: TRACE,
    },
    {
      name: 'Should_Pass_When_IntegrationTestRunsCodeThatEmitsSpans',
      code:
        `import { makeFeature } from '@systemfsoftware/effect-gherkin-spec'\nimport { Effect } from 'effect'\nconst run = Effect.succeed(1).pipe(Effect.withSpan('cycle'))\n`,
      filename: INTEGRATION,
    },
    {
      name: 'Should_Pass_When_ProductionSourceImportsTheSdkOutsideAnyTestBlock',
      code:
        `import * as NodeSdk from '@effect/opentelemetry/NodeSdk'\nimport { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base'\nexport const layer = NodeSdk.layer(() => ({ spanProcessor: new BatchSpanProcessor(exporter) }))\n`,
      filename: SOURCE,
    },
    {
      name: 'Should_Pass_When_InSourcePropertyTestsAPrivateCombinatorWithNoTracer',
      code:
        `import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base'\nconst closing = (run) => Promise.resolve().then(run).catch(() => undefined)\nexport const p = new BatchSpanProcessor(e)\nif (import.meta.vitest !== undefined) {\n  const { it } = await import('@systemfsoftware/vitest')\n  it.effect.prop('∀o_Closing_≡Resolves', { of: [o], subject: closing }, (s, [v]) => s(v))\n}\n`,
      filename: SOURCE,
    },
    {
      name: 'Should_Pass_When_TypeOnlyImportOfTheSdkInAnIntegrationTest',
      code: `import type { ReadableSpan } from '@opentelemetry/sdk-trace-base'\n`,
      filename: INTEGRATION,
    },
    {
      name: 'Should_Pass_When_ApiTypesDescribeAWireContext',
      code: `import { type SpanContext } from '@opentelemetry/api'\n`,
      filename: INTEGRATION,
    },
    {
      name: 'Should_Pass_When_IntegrationTestImportsANonTelemetryFixture',
      code: `import * as Db from './__fixtures__/db.js'\n`,
      filename: INTEGRATION,
    },
    {
      name: 'Should_Pass_When_AnInSourceBlockCallsAPrototypeNamedMethod',
      code:
        `export const x = 1\nif (import.meta.vitest !== undefined) {\n  const s = x.toString()\n  const c = constructor\n}\n`,
      filename: SOURCE,
    },
    {
      name: 'Should_Pass_When_AFixtureForATraceSuiteDeclaresItsTaxonomyWithTraceSpec',
      code:
        `import { Span } from '@systemfsoftware/trace-spec'\nexport const Concluded = Span.declare({ id: 'c', name: 'check.concluded', attrs: {} })\n`,
      filename: FIXTURE,
    },
    {
      name: 'Should_Pass_When_ATransportTestPostsAStringThatHappensToBeOtlp',
      code: `const body = new TextEncoder().encode('{"resourceSpans":[]}')\n`,
      filename: INTEGRATION,
    },
    {
      name: 'Should_Pass_When_ProductionSourceDeclaresTheWireShape',
      code: `export const Traces = Schema.Struct({ resourceSpans: Schema.Array(Resource) })\n`,
      filename: SOURCE,
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_IntegrationTestReadsTheExportedTracePayloadOnce',
      code: `const spans = request.resourceSpans.flatMap((r) => r.scopeSpans)\nconst again = request.resourceSpans\n`,
      filename: INTEGRATION,
      errors: [
        error('resourceSpans', NOT_TRACE, "this file reads 'resourceSpans', which only exported spans carry"),
        error('scopeSpans', NOT_TRACE, "this file reads 'scopeSpans', which only exported spans carry"),
      ],
    },
    {
      name: 'Should_Report_When_AFixtureDeclaresTheTracePayloadShape',
      code: `export const TracesText = Schema.Struct({ resourceSpans: Schema.Array(Resource) })\n`,
      filename: FIXTURE,
      errors: [error('resourceSpans', NOT_TRACE, "this file reads 'resourceSpans', which only exported spans carry")],
    },
    {
      name: 'Should_Report_When_APlainTestReadsAnInMemoryExportersSpans',
      code: `const spans = exporter.getFinishedSpans()\n`,
      filename: PLAIN_TEST,
      errors: [
        error('getFinishedSpans', NOT_TRACE, "this file reads 'getFinishedSpans', which only exported spans carry"),
      ],
    },
    {
      name: 'Should_Report_When_IntegrationTestBuildsTheSdkAndASpanProcessor',
      code:
        `import * as NodeSdk from '@effect/opentelemetry/NodeSdk'\nimport { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base'\n`,
      filename: INTEGRATION,
      errors: [imports('@effect/opentelemetry/NodeSdk'), imports('@opentelemetry/sdk-trace-base')],
    },
    {
      name: 'Should_Report_When_APlainTestImportsAnInMemoryExporter',
      code: `import { InMemorySpanExporter } from '@opentelemetry/sdk-trace-base'\n`,
      filename: PLAIN_TEST,
      errors: [imports('@opentelemetry/sdk-trace-base')],
    },
    {
      name: 'Should_Report_When_AFixtureUnderTestsWiresTheSdk',
      code: `export { layer } from '@effect/opentelemetry/NodeSdk'\n`,
      filename: FIXTURE,
      errors: [imports('@effect/opentelemetry/NodeSdk')],
    },
    {
      name: 'Should_Report_When_IntegrationTestImportsTheSdkDynamicallyOrByRequire',
      code:
        "const a = await import('@effect/opentelemetry/NodeSdk')\nconst b = await import(`@opentelemetry/sdk-trace-base`)\nconst c = createRequire(import.meta.url)('@opentelemetry/sdk-trace-node')\n",
      filename: INTEGRATION,
      errors: [
        imports('@effect/opentelemetry/NodeSdk'),
        imports('@opentelemetry/sdk-trace-base'),
        imports('@opentelemetry/sdk-trace-node'),
      ],
    },
    {
      name: 'Should_Report_When_IntegrationTestImportsTraceSpec',
      code: `import { ObservationWindow } from '@systemfsoftware/trace-spec'\n`,
      filename: INTEGRATION,
      errors: [
        error(
          '@systemfsoftware/trace-spec',
          NOT_TRACE,
          'a trace contract is written under a suffix that is not `.trace.test.ts`',
        ),
      ],
    },
    {
      name: 'Should_Report_When_IntegrationTestBuildsOrProvidesItsOwnTracer',
      code: `const t = Tracer.make({ span })\nconst l = Layer.succeed(Tracer.Tracer, t)\n`,
      filename: INTEGRATION,
      errors: [BUILDS_TRACER, BUILDS_TRACER],
    },
    {
      name: 'Should_Report_When_AnInSourceBlockUsesTheSdk',
      code:
        `import { InMemorySpanExporter } from '@opentelemetry/sdk-trace-base'\nexport const x = 1\nif (import.meta.vitest !== undefined) {\n  const e = new InMemorySpanExporter()\n  const again = new InMemorySpanExporter()\n}\n`,
      filename: SOURCE,
      errors: [
        error(
          '@opentelemetry/sdk-trace-base',
          IN_SOURCE,
          "this block uses 'InMemorySpanExporter', imported from '@opentelemetry/sdk-trace-base'",
        ),
      ],
    },
    {
      name: 'Should_Report_When_AnInSourceBlockImportsTheSdkDynamically',
      code: `if (import.meta.vitest !== undefined) {\n  const sdk = await import('@effect/opentelemetry/NodeSdk')\n}\n`,
      filename: SOURCE,
      errors: [
        error(
          '@effect/opentelemetry/NodeSdk',
          IN_SOURCE,
          "this file imports '@effect/opentelemetry/NodeSdk', which builds or exports spans",
        ),
      ],
    },
  ],
})
