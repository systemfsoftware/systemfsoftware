import { EXPECTED, FIX } from '../ban-raw-span-name-emit.config.js'
import { banRawSpanNameEmit } from '../ban-raw-span-name-emit.js'
import { createRuleTester } from './_tester.js'

const ruleTester = createRuleTester()

const rawSpanName = (name: string, callee: string) => [{
  messageId: 'banRawSpanName',
  data: {
    name,
    callee,
    expected: EXPECTED,
    actual: name,
    fix: FIX,
  },
}]

ruleTester.run('ban-raw-span-name-emit', banRawSpanNameEmit, {
  valid: [
    {
      name: 'Should_StaySilent_When_SpanIsDeclared',
      code: "Span.declare({ id: 'x', name: 'checkout.place_order', attrs })",
    },
    {
      name: 'Should_StaySilent_When_DeclaredSpanIsStarted',
      code: "PlaceOrder.start({ 'app.user.id': u })(effect)",
    },
    {
      name: 'Should_StaySilent_When_NonEmitFunctionGetsStringLiteral',
      code: "loadConfig('checkout.place_order')",
    },
    {
      name: 'Should_StaySilent_When_EmitCalleeGetsDynamicName',
      code: 'startSpan(spanName)',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_TracerStartsSpanWithStringLiteral',
      code: "tracer.startSpan('checkout.place_order')",
      errors: rawSpanName('checkout.place_order', 'startSpan'),
    },
    {
      name: 'Should_Report_When_BareSpanBuilderGetsStringLiteral',
      code: "spanBuilder('x')",
      errors: rawSpanName('x', 'spanBuilder'),
    },
    {
      name: 'Should_Report_When_StartActiveSpanGetsExpressionFreeTemplate',
      code: 'startActiveSpan(`a-b`)',
      errors: rawSpanName('a-b', 'startActiveSpan'),
    },
    {
      name: 'Should_Report_When_EmitCallInterpolatesTemplate',
      code: 'tracer.startSpan(`checkout.${op}`)',
      errors: rawSpanName('checkout.${}', 'startSpan'),
    },
  ],
})
