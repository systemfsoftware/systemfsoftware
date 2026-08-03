import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { stateSingleTagExport } from '../state-single-tag-export.js'

RuleTester.it = vitest.it
RuleTester.itOnly = vitest.it.only
RuleTester.describe = vitest.describe

const ruleTester = new RuleTester({
  languageOptions: {
    parserOptions: {
      lang: 'ts',
    },
  },
})

const multipleTagExportData = (name: string, index: number, count: number) => ({
  name,
  expected:
    'at most one exported Context.Tag per *.state.ts (a runtime cell may publish its handle directly and skip the Tag entirely)',
  actual: `tag ${index} of ${count}`,
  fix:
    'delete the Tag nothing consumes; if both are consumed they are two state cells, so split them into one *.state.ts per Tag; merge them only when both name the same state',
})

const SERVICE = `{ readonly joinInFlight: (id: string, effect: Effect<Report>) => Effect<Report> }`

ruleTester.run('state-single-tag-export', stateSingleTagExport, {
  valid: [
    {
      name: 'Should_Pass_When_SingleTagClassExport',
      code: `export class AuditInFlight extends Context.Tag('AuditInFlight')<AuditInFlight, ${SERVICE}>() {}`,
      filename: 'audit-inflight.state.ts',
    },
    {
      name: 'Should_Pass_When_SingleTagConstExport',
      code: `export const AuditInFlight = Context.Tag('AuditInFlight')<AuditInFlight, ${SERVICE}>()`,
      filename: 'audit-inflight.state.ts',
    },
    {
      name: 'Should_Pass_When_SingleDefaultExportedTagClass',
      code: `export default class AuditInFlight extends Context.Tag('AuditInFlight')<AuditInFlight, ${SERVICE}>() {}`,
      filename: 'audit-inflight.state.ts',
    },
    {
      name: 'Should_Pass_When_TagClassWithLiveLayer',
      code: `const inFlight = new Map<string, Deferred<Report>>()
export class AuditInFlight extends Context.Tag('AuditInFlight')<AuditInFlight, ${SERVICE}>() {}
export const AuditInFlightLive = AuditInFlight.of({ joinInFlight: (id: string, effect: Effect<Report>) => effect })`,
      filename: 'audit-inflight.state.ts',
    },
    {
      name: 'Should_Pass_When_ZeroTagsAndManagedRuntimeHandlePublished',
      code: `const runtime = ManagedRuntime.make(Layer.empty)
export { runtime }`,
      filename: 'runtime.state.ts',
    },
    {
      name: 'Should_Pass_When_ZeroTagsAndLayerToRuntimeHandlePublished',
      code: `const runtime = Layer.toRuntime(Layer.empty)
export { runtime }`,
      filename: 'runtime.state.ts',
    },
    {
      name: 'Should_Pass_When_ZeroTagsAndEmptyStateFile',
      code: ``,
      filename: 'empty.state.ts',
    },
    {
      name: 'Should_Pass_When_ZeroTagsAndOnlyModuleScopePrimitive',
      code: `const inFlight = new Map<string, Deferred<Report>>()`,
      filename: 'audit-inflight.state.ts',
    },
    {
      name: 'Should_Pass_When_ZeroTagsAndOnlyLiveLayer',
      code: `const inFlight = new Map<string, Deferred<Report>>()
export const AuditInFlightLive = AuditInFlight.of({ joinInFlight: (id: string, effect: Effect<Report>) => effect })`,
      filename: 'audit-inflight.state.ts',
    },
    {
      name: 'Should_Pass_When_ZeroTagsAndOnlyFunctionSurface',
      code: `const inFlight = new Map<string, Deferred<Report>>()
export const joinInFlight = (id: string, effect: Effect<Report>) => effect`,
      filename: 'audit-inflight.state.ts',
    },
    {
      name: 'Should_Pass_When_GenericTagNearMiss',
      code: `export class AuditInFlight extends Context.GenericTag('AuditInFlight')<AuditInFlight, ${SERVICE}>() {}
export class AuditInFlightState extends Context.Tag('AuditInFlightState')<AuditInFlightState, ${SERVICE}>() {}`,
      filename: 'audit-inflight.state.ts',
    },
    {
      name: 'Should_Pass_When_AliasedContextNearMiss',
      code: `import { Context as C } from 'effect'
export class AuditInFlight extends C.Tag('AuditInFlight')<AuditInFlight, ${SERVICE}>() {}
export class AuditInFlightState extends Context.Tag('AuditInFlightState')<AuditInFlightState, ${SERVICE}>() {}`,
      filename: 'audit-inflight.state.ts',
    },
    {
      name: 'Should_Pass_When_LowercaseTagNearMiss',
      code: `export class AuditInFlight extends Context.tag('AuditInFlight')<AuditInFlight, ${SERVICE}>() {}
export class AuditInFlightState extends Context.Tag('AuditInFlightState')<AuditInFlightState, ${SERVICE}>() {}`,
      filename: 'audit-inflight.state.ts',
    },
    {
      name: 'Should_Pass_When_NonTagClassExport',
      code: `export class AuditInFlight {
  readonly joinInFlight = (id: string, effect: Effect<Report>) => effect
}
export class AuditInFlightState extends Context.Tag('AuditInFlightState')<AuditInFlightState, ${SERVICE}>() {}`,
      filename: 'audit-inflight.state.ts',
    },
    {
      name: 'Should_Pass_When_DefaultExportedNonTagClassAlongsideNamedTag',
      code: `export class AuditInFlight extends Context.Tag('AuditInFlight')<AuditInFlight, ${SERVICE}>() {}
export default class RegistryNotATag {}`,
      filename: 'audit-inflight.state.ts',
    },
    {
      name: 'Should_Pass_When_DefaultExportedNonTagExpressionAlongsideNamedTag',
      code: `export class AuditInFlight extends Context.Tag('AuditInFlight')<AuditInFlight, ${SERVICE}>() {}
export default new Map<string, string>()`,
      filename: 'audit-inflight.state.ts',
    },
    {
      name: 'Should_Pass_When_TagInExecutorFile',
      code: `export class AuditInFlight extends Context.Tag('AuditInFlight')<AuditInFlight, ${SERVICE}>() {}`,
      filename: 'audit-inflight.executor.ts',
    },
    {
      name: 'Should_Pass_When_TagInWorkflowFile',
      code: `export class AuditInFlight extends Context.Tag('AuditInFlight')<AuditInFlight, ${SERVICE}>() {}`,
      filename: 'audit-inflight.workflow.ts',
    },
    {
      name: 'Should_Pass_When_TwoTagsInExecutorFile',
      code: `export class AuditInFlight extends Context.Tag('AuditInFlight')<AuditInFlight, ${SERVICE}>() {}
export class PaymentInFlight extends Context.Tag('PaymentInFlight')<PaymentInFlight, ${SERVICE}>() {}`,
      filename: 'audit-inflight.executor.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_MultipleTagExports_When_TwoTagsAfterZeroTagFlip',
      code: `export class AuditInFlight extends Context.Tag('AuditInFlight')<AuditInFlight, ${SERVICE}>() {}
export class PaymentInFlight extends Context.Tag('PaymentInFlight')<PaymentInFlight, ${SERVICE}>() {}`,
      filename: 'audit-inflight.state.ts',
      errors: [{ messageId: 'multipleTagExports', data: multipleTagExportData('PaymentInFlight', 2, 2) }],
    },
    {
      name: 'Should_Report_MultipleTagExports_When_TwoTagClasses',
      code: `export class AuditInFlight extends Context.Tag('AuditInFlight')<AuditInFlight, ${SERVICE}>() {}
export class PaymentInFlight extends Context.Tag('PaymentInFlight')<PaymentInFlight, { readonly join: (id: string, effect: Effect<Report>) => Effect<Report> }>() {}`,
      filename: 'audit-inflight.state.ts',
      errors: [{ messageId: 'multipleTagExports', data: multipleTagExportData('PaymentInFlight', 2, 2) }],
    },
    {
      name: 'Should_Report_MultipleTagExports_When_DefaultAndNamedTag',
      code: `export default class AuditInFlight extends Context.Tag('AuditInFlight')<AuditInFlight, ${SERVICE}>() {}
export class PaymentInFlight extends Context.Tag('PaymentInFlight')<PaymentInFlight, ${SERVICE}>() {}`,
      filename: 'audit-inflight.state.ts',
      errors: [{ messageId: 'multipleTagExports', data: multipleTagExportData('PaymentInFlight', 2, 2) }],
    },
    {
      name: 'Should_Report_MultipleTagExports_When_AnonymousDefaultTagFollowsNamedTag',
      code: `export class AuditInFlight extends Context.Tag('AuditInFlight')<AuditInFlight, ${SERVICE}>() {}
export default class extends Context.Tag('PaymentInFlight')<PaymentInFlight, ${SERVICE}>() {}`,
      filename: 'audit-inflight.state.ts',
      errors: [{ messageId: 'multipleTagExports', data: multipleTagExportData('default export', 2, 2) }],
    },
    {
      name: 'Should_Report_MultipleTagExports_When_TwoConstTagExports',
      code: `export const AuditInFlight = Context.Tag('AuditInFlight')<AuditInFlight, ${SERVICE}>()
export const PaymentInFlight = Context.Tag('PaymentInFlight')<PaymentInFlight, ${SERVICE}>()`,
      filename: 'audit-inflight.state.ts',
      errors: [{ messageId: 'multipleTagExports', data: multipleTagExportData('PaymentInFlight', 2, 2) }],
    },
    {
      name: 'Should_Report_MultipleTagExports_When_TwoConstTagsInOneDeclaration',
      code: `export const AuditInFlight = Context.Tag('AuditInFlight')<AuditInFlight, ${SERVICE}>(),
  PaymentInFlight = Context.Tag('PaymentInFlight')<PaymentInFlight, ${SERVICE}>()`,
      filename: 'audit-inflight.state.ts',
      errors: [{ messageId: 'multipleTagExports', data: multipleTagExportData('PaymentInFlight', 2, 2) }],
    },
    {
      name: 'Should_Report_MultipleTagExports_When_DefaultTagExpressionFollowsNamedTag',
      code: `export class AuditInFlight extends Context.Tag('AuditInFlight')<AuditInFlight, ${SERVICE}>() {}
export default Context.Tag('PaymentInFlight')<PaymentInFlight, ${SERVICE}>()`,
      filename: 'audit-inflight.state.ts',
      errors: [{ messageId: 'multipleTagExports', data: multipleTagExportData('default export', 2, 2) }],
    },
  ],
})
