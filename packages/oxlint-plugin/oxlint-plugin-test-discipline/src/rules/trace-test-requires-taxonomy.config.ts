import { MESSAGE } from './path.config.js'

export const HARNESS_PRESCRIPTION =
  'import { Suite, Case, Rel, Graph, Observe, Stimulus } from @systemfsoftware/trace-spec and terminate every case on a relation hold — .holds(Rel.all(Rel.exists(PlaceOrder), Rel.child(PlaceOrder, PaymentCapture)))' as const

export const MISSING_HARNESS_ACTUAL = 'no trace-spec import found in a file named as a trace spec' as const

export const HTTP_TERMINATION_EXPECTED =
  'a case terminated on a relation hold — .holds(Rel.all(...)) over the declared span graph' as const

export const HTTP_TERMINATION_ACTUAL = 'an HTTP response assertion terminating the case' as const

export const HTTP_TERMINATION_FIX =
  'replace the HTTP assertion with a relation over the observed spans, e.g. .holds(Rel.all(Rel.exists(PlaceOrder), Rel.child(PlaceOrder, PaymentCapture)))' as const

export const RAW_EMIT_EXPECTED =
  'spans declared once with Span.declare({ id, name, attrs }) inside the traced cell; the spec observes the decoded graph' as const

export const RAW_EMIT_ACTUAL = 'a raw span emit call inside a trace spec' as const

export const RAW_EMIT_FIX =
  'delete the emit; declare the span with Span.declare in the system under test and assert on the graph the spec receives' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'A *.trace.test.ts must import its harness from @systemfsoftware/trace-spec and terminate cases on relation holds over the declared span graph. Raw emit calls (startSpan, spanBuilder, startActiveSpan) and HTTP status or body assertions (expect(res.status).toBe(200), expect(response.body)...) are forbidden — replacing that altitude is what a trace spec exists for.',
  },
  schema: [],
  messages: {
    missingHarnessImport: MESSAGE,
    httpTermination: MESSAGE,
    rawEmitCall: MESSAGE,
  },
} as const
