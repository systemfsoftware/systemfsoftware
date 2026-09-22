import {
  HARNESS_PRESCRIPTION,
  HTTP_TERMINATION_ACTUAL,
  HTTP_TERMINATION_EXPECTED,
  HTTP_TERMINATION_FIX,
  MISSING_HARNESS_ACTUAL,
  RAW_EMIT_ACTUAL,
  RAW_EMIT_EXPECTED,
  RAW_EMIT_FIX,
} from '../trace-test-requires-taxonomy.config.js'
import { traceTestRequiresTaxonomy } from '../trace-test-requires-taxonomy.js'
import { createRuleTester } from './_tester.js'

const ruleTester = createRuleTester()

const TRACE_SPEC_FILENAME = '/repo/examples/inventory-fulfillment/tests/fulfillment.settle.trace.test.ts'

const missingImportError = {
  messageId: 'missingHarnessImport' as const,
  data: {
    name: 'a *.trace.test.ts without @systemfsoftware/trace-spec',
    expected: HARNESS_PRESCRIPTION,
    actual: MISSING_HARNESS_ACTUAL,
    fix: HARNESS_PRESCRIPTION,
  },
}

const httpTerminationError = (member: string) => ({
  messageId: 'httpTermination' as const,
  data: {
    name: `expect(...${member}) inside a trace spec`,
    expected: HTTP_TERMINATION_EXPECTED,
    actual: HTTP_TERMINATION_ACTUAL,
    fix: HTTP_TERMINATION_FIX,
  },
})

const rawEmitError = (name: string) => ({
  messageId: 'rawEmitCall' as const,
  data: {
    name: `${name}(...) inside a trace spec`,
    expected: RAW_EMIT_EXPECTED,
    actual: RAW_EMIT_ACTUAL,
    fix: RAW_EMIT_FIX,
  },
})

ruleTester.run('trace-test-requires-taxonomy', traceTestRequiresTaxonomy, {
  valid: [
    {
      name: 'Should_Allow_RelationTermination_When_TraceSpecImportsHarness',
      code: `
        import { Rel, Suite } from '@systemfsoftware/trace-spec'

        Suite('fulfillment.settle').body(({ Case }) => {
          Case('settle completes the order').holds(
            Rel.all(Rel.exists(PlaceOrder), Rel.child(PlaceOrder, PaymentCapture)),
          )
        })
      `,
      filename: TRACE_SPEC_FILENAME,
    },
    {
      name: 'Should_Allow_DomainAssertion_When_TraceSpecAssertsNonHttpResponse',
      code: `
        import { Rel, Suite } from '@systemfsoftware/trace-spec'

        Suite('fulfillment.settle').body(() => {
          expect(order.total).toBe(200)
        })
      `,
      filename: TRACE_SPEC_FILENAME,
    },
    {
      name: 'Should_Allow_HttpStatusAssertion_When_FileIsIntegration',
      code: 'expect(res.status).toBe(200)',
      filename: '/repo/examples/inventory-fulfillment/tests/inventory-fulfillment.integration.test.ts',
    },
    {
      name: 'Should_Allow_MissingHarnessImport_When_FileIsNotATraceSpec',
      code: "const order = { id: '1' }",
      filename: '/repo/examples/inventory-fulfillment/src/fulfillment/settle.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_HttpTermination_When_TraceSpecAssertsStatus',
      code: `
        import { Rel, Suite } from '@systemfsoftware/trace-spec'

        Suite('fulfillment.settle').body(() => {
          expect(res.status).toBe(200)
        })
      `,
      filename: TRACE_SPEC_FILENAME,
      errors: [httpTerminationError('status')],
    },
    {
      name: 'Should_Report_HttpTermination_When_TraceSpecAssertsResponseBody',
      code: `
        import { Suite } from '@systemfsoftware/trace-spec'

        expect(response.body).toEqual({ ok: true })
      `,
      filename: TRACE_SPEC_FILENAME,
      errors: [httpTerminationError('body')],
    },
    {
      name: 'Should_Report_MissingHarnessImport_When_TraceSpecImportsNothing',
      code: "const order = { id: '1' }",
      filename: TRACE_SPEC_FILENAME,
      errors: [missingImportError],
    },
    {
      name: 'Should_Report_RawEmit_When_TraceSpecStartsSpan',
      code: `
        import { Suite } from '@systemfsoftware/trace-spec'

        tracer.startSpan('checkout.place_order')
      `,
      filename: TRACE_SPEC_FILENAME,
      errors: [rawEmitError('startSpan')],
    },
  ],
})
