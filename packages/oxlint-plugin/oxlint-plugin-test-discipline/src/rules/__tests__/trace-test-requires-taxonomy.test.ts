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

const httpTerminationShapeError = (shape: string) => ({
  messageId: 'httpTermination' as const,
  data: {
    name: `expect(...).${shape} inside a trace spec`,
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
      name: 'Should_Allow_DomainPropertyPath_When_TraceSpecAssertsNonHttpPath',
      code: `
        import { Rel, Suite } from '@systemfsoftware/trace-spec'

        Suite('fulfillment.settle').body(() => {
          expect(res).toHaveProperty('app.order.id')
        })
      `,
      filename: TRACE_SPEC_FILENAME,
    },
    {
      name: 'Should_Allow_ComputedPropertyKey_When_TraceSpecAssertsNonLiteralPath',
      code: `
        import { Rel, Suite } from '@systemfsoftware/trace-spec'

        Suite('fulfillment.settle').body(() => {
          expect(res).toHaveProperty(order.path)
        })
      `,
      filename: TRACE_SPEC_FILENAME,
    },
    {
      name: 'Should_Allow_DomainObjectShape_When_TraceSpecAssertsNonHttpKeys',
      code: `
        import { Rel, Suite } from '@systemfsoftware/trace-spec'

        Suite('fulfillment.settle').body(() => {
          expect(res).toMatchObject({ orderId: 'order-1' })
          expect(res).toEqual({ orderId: 'order-1' })
        })
      `,
      filename: TRACE_SPEC_FILENAME,
    },
    {
      name: 'Should_Allow_MissingHarnessImport_When_FileIsNotATraceSpec',
      code: "const order = { id: '1' }",
      filename: '/repo/examples/inventory-fulfillment/src/fulfillment/settle.ts',
    },
    {
      name: 'Should_Allow_DomainAssertion_When_TraceSpecAssertsNonHttpInsideThenCallback',
      code: `
        import { Rel, Suite } from '@systemfsoftware/trace-spec'

        Suite('fulfillment.settle').body(() => {
          res.then((r) => expect(r.total).toBe(200))
        })
      `,
      filename: TRACE_SPEC_FILENAME,
    },
    {
      name: 'Should_Allow_DomainObjectShape_When_TraceSpecAssertsNestedNonHttpKeys',
      code: `
        import { Rel, Suite } from '@systemfsoftware/trace-spec'

        Suite('fulfillment.settle').body(() => {
          expect(res).toEqual({ data: { orderId: 'order-1' } })
        })
      `,
      filename: TRACE_SPEC_FILENAME,
    },
    {
      name: 'Should_Allow_DomainPropertyPath_When_TraceSpecAssertsToHavePropertyArrayPath',
      code: `
        import { Rel, Suite } from '@systemfsoftware/trace-spec'

        Suite('fulfillment.settle').body(() => {
          expect(res).toHaveProperty(['orderId'])
        })
      `,
      filename: TRACE_SPEC_FILENAME,
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
      name: 'Should_Report_HttpTermination_When_TraceSpecAssertsToHavePropertyStatus',
      code: `
        import { Rel, Suite } from '@systemfsoftware/trace-spec'

        Suite('fulfillment.settle').body(() => {
          expect(res).toHaveProperty('status', 200)
        })
      `,
      filename: TRACE_SPEC_FILENAME,
      errors: [httpTerminationShapeError("toHaveProperty('status')")],
    },
    {
      name: 'Should_Report_HttpTermination_When_TraceSpecAssertsToHavePropertyBody',
      code: `
        import { Rel, Suite } from '@systemfsoftware/trace-spec'

        Suite('fulfillment.settle').body(() => {
          expect(res).toHaveProperty('body')
        })
      `,
      filename: TRACE_SPEC_FILENAME,
      errors: [httpTerminationShapeError("toHaveProperty('body')")],
    },
    {
      name: 'Should_Report_HttpTermination_When_TraceSpecAssertsToHavePropertyStatusText',
      code: `
        import { Rel, Suite } from '@systemfsoftware/trace-spec'

        Suite('fulfillment.settle').body(() => {
          expect(res).toHaveProperty('statusText')
        })
      `,
      filename: TRACE_SPEC_FILENAME,
      errors: [httpTerminationShapeError("toHaveProperty('statusText')")],
    },
    {
      name: 'Should_Report_HttpTermination_When_TraceSpecAssertsToHavePropertyNestedBodyPath',
      code: `
        import { Rel, Suite } from '@systemfsoftware/trace-spec'

        Suite('fulfillment.settle').body(() => {
          expect(res).toHaveProperty('body.items')
        })
      `,
      filename: TRACE_SPEC_FILENAME,
      errors: [httpTerminationShapeError("toHaveProperty('body')")],
    },
    {
      name: 'Should_Report_HttpTermination_When_TraceSpecNotAssertsToHavePropertyStatus',
      code: `
        import { Rel, Suite } from '@systemfsoftware/trace-spec'

        Suite('fulfillment.settle').body(() => {
          expect(res).not.toHaveProperty('status')
        })
      `,
      filename: TRACE_SPEC_FILENAME,
      errors: [httpTerminationShapeError("toHaveProperty('status')")],
    },
    {
      name: 'Should_Report_HttpTermination_When_TraceSpecAssertsToMatchObjectStatus',
      code: `
        import { Rel, Suite } from '@systemfsoftware/trace-spec'

        Suite('fulfillment.settle').body(() => {
          expect(res).toMatchObject({ status: 200 })
        })
      `,
      filename: TRACE_SPEC_FILENAME,
      errors: [httpTerminationShapeError('toMatchObject({ status: ... })')],
    },
    {
      name: 'Should_Report_HttpTermination_When_TraceSpecResolvesToMatchObjectStatus',
      code: `
        import { Rel, Suite } from '@systemfsoftware/trace-spec'

        Suite('fulfillment.settle').body(async () => {
          await expect(res).resolves.toMatchObject({ status: 200 })
        })
      `,
      filename: TRACE_SPEC_FILENAME,
      errors: [httpTerminationShapeError('toMatchObject({ status: ... })')],
    },
    {
      name: 'Should_Report_HttpTermination_When_TraceSpecRejectsToMatchObjectStatus',
      code: `
        import { Rel, Suite } from '@systemfsoftware/trace-spec'

        Suite('fulfillment.settle').body(async () => {
          await expect(res).rejects.toMatchObject({ status: 500 })
        })
      `,
      filename: TRACE_SPEC_FILENAME,
      errors: [httpTerminationShapeError('toMatchObject({ status: ... })')],
    },
    {
      name: 'Should_Report_HttpTermination_When_TraceSpecAssertsToEqualStatus',
      code: `
        import { Rel, Suite } from '@systemfsoftware/trace-spec'

        Suite('fulfillment.settle').body(() => {
          expect(res).toEqual({ status: 200 })
        })
      `,
      filename: TRACE_SPEC_FILENAME,
      errors: [httpTerminationShapeError('toEqual({ status: ... })')],
    },
    {
      name: 'Should_Report_HttpTermination_When_TraceSpecAssertsToStrictEqualBody',
      code: `
        import { Rel, Suite } from '@systemfsoftware/trace-spec'

        Suite('fulfillment.settle').body(() => {
          expect(res).toStrictEqual({ body: 'fulfilled' })
        })
      `,
      filename: TRACE_SPEC_FILENAME,
      errors: [httpTerminationShapeError('toStrictEqual({ body: ... })')],
    },
    {
      name: 'Should_Report_HttpTermination_When_TraceSpecAssertsObjectContainingStatus',
      code: `
        import { Rel, Suite } from '@systemfsoftware/trace-spec'

        Suite('fulfillment.settle').body(() => {
          expect(res).toEqual(expect.objectContaining({ status: 200 }))
        })
      `,
      filename: TRACE_SPEC_FILENAME,
      errors: [httpTerminationShapeError('objectContaining({ status: ... })')],
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
    {
      name: 'Should_Report_HttpTermination_When_TraceSpecAssertsStatusInsideThenCallback',
      code: `
        import { Rel, Suite } from '@systemfsoftware/trace-spec'

        Suite('fulfillment.settle').body(() => {
          res.then((r) => expect(r.status).toBe(200))
        })
      `,
      filename: TRACE_SPEC_FILENAME,
      errors: [httpTerminationError('status')],
    },
    {
      name: 'Should_Report_HttpTermination_When_TraceSpecAssertsStatusInsideThenBlockCallback',
      code: `
        import { Rel, Suite } from '@systemfsoftware/trace-spec'

        Suite('fulfillment.settle').body(() => {
          res.then((r) => {
            expect(r.status).toBe(200)
          })
        })
      `,
      filename: TRACE_SPEC_FILENAME,
      errors: [httpTerminationError('status')],
    },
    {
      name: 'Should_Report_HttpTermination_When_TraceSpecAwaitsThenToHavePropertyStatus',
      code: `
        import { Rel, Suite } from '@systemfsoftware/trace-spec'

        Suite('fulfillment.settle').body(async () => {
          await fetch(url).then((r) => expect(r).toHaveProperty('status', 200))
        })
      `,
      filename: TRACE_SPEC_FILENAME,
      errors: [httpTerminationShapeError("toHaveProperty('status')")],
    },
    {
      name: 'Should_Report_HttpTermination_When_TraceSpecAssertsToHavePropertyArrayPathStatus',
      code: `
        import { Rel, Suite } from '@systemfsoftware/trace-spec'

        Suite('fulfillment.settle').body(() => {
          expect(res).toHaveProperty(['status'], 200)
        })
      `,
      filename: TRACE_SPEC_FILENAME,
      errors: [httpTerminationShapeError("toHaveProperty('status')")],
    },
    {
      name: 'Should_Report_HttpTermination_When_TraceSpecAssertsToHavePropertyArrayPathBody',
      code: `
        import { Rel, Suite } from '@systemfsoftware/trace-spec'

        Suite('fulfillment.settle').body(() => {
          expect(res).toHaveProperty(['body', 'items'])
        })
      `,
      filename: TRACE_SPEC_FILENAME,
      errors: [httpTerminationShapeError("toHaveProperty('body')")],
    },
    {
      name: 'Should_Report_HttpTermination_When_TraceSpecAssertsToEqualNestedStatus',
      code: `
        import { Rel, Suite } from '@systemfsoftware/trace-spec'

        Suite('fulfillment.settle').body(() => {
          expect(res).toEqual({ data: { status: 200 } })
        })
      `,
      filename: TRACE_SPEC_FILENAME,
      errors: [httpTerminationShapeError('toEqual({ status: ... })')],
    },
    {
      name: 'Should_Report_HttpTermination_When_TraceSpecAssertsToMatchObjectNestedBody',
      code: `
        import { Rel, Suite } from '@systemfsoftware/trace-spec'

        Suite('fulfillment.settle').body(() => {
          expect(res).toMatchObject({ response: { body: { ok: true } } })
        })
      `,
      filename: TRACE_SPEC_FILENAME,
      errors: [httpTerminationShapeError('toMatchObject({ body: ... })')],
    },
    {
      name: 'Should_Report_HttpTermination_When_TraceSpecAssertsNestedBodyInsideArrayElement',
      code: `
        import { Rel, Suite } from '@systemfsoftware/trace-spec'

        Suite('fulfillment.settle').body(() => {
          expect(res).toMatchObject({ items: [{ body: 'fulfilled' }] })
        })
      `,
      filename: TRACE_SPEC_FILENAME,
      errors: [httpTerminationShapeError('toMatchObject({ body: ... })')],
    },
  ],
})
