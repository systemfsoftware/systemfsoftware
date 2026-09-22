export const EMIT_CALLEES = ['startActiveSpan', 'spanBuilder', 'startSpan'] as const

export const EXPECTED =
  'a span declared once with Span.declare({ id, name, attrs }) and started through the start(attrs) it returns' as const

export const FIX =
  'declare the span with Span.declare({ id, name, attrs }) and emit it with SomeSpan.start(attrs)' as const

export const MESSAGE_BAN_RAW_SPAN_NAME =
  "'{{name}}' is forbidden at {{callee}}. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}."

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Ban a raw span name passed to an emit API (startSpan, spanBuilder, startActiveSpan). Span names enter through Span.declare, never as a literal at the emit site.',
  },
  schema: [],
  messages: {
    banRawSpanName: MESSAGE_BAN_RAW_SPAN_NAME,
  },
} as const
