import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { stateNoRawPrimitiveExports } from '../state-no-raw-primitive-exports.js'

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

const rawPrimitiveExportData = (name: string, kind: string) => ({
  name,
  expected: 'a domain-typed surface — a function returning Effect<A, E, R> (withLock, joinInFlight, ask, tell)',
  actual: `the raw ${kind} exported directly`,
  fix: 'keep the primitive module-scope but private; export a withLock/joinInFlight-style method plus the Context.Tag',
})

ruleTester.run('state-no-raw-primitive-exports', stateNoRawPrimitiveExports, {
  valid: [
    {
      name: 'Should_Pass_When_CanonicalTagAndLiveWithPrivateMap',
      code: `const inFlight = new Map<string, Deferred<Report>>()
export class AuditInFlight extends Context.Tag('AuditInFlight')<AuditInFlight, { readonly joinInFlight: (id: string, effect: Effect<Report>) => Effect<Report> }>() {}
export const AuditInFlightLive = AuditInFlight.of({
  joinInFlight: (id: string, effect: Effect<Report>) => Effect.gen(function*() {
    const existing = inFlight.get(id)
    if (existing) return yield* existing.await
    const deferred = Deferred.unsafeMake<Report>()
    inFlight.set(id, deferred)
    return yield* effect
  }),
})`,
      filename: 'audit-inflight.state.ts',
    },
    {
      name: 'Should_Pass_When_ExportedFunctionSurface',
      code: `const inFlight = new Map<string, Deferred<Report>>()
export const joinInFlight = (id: string, effect: Effect<Report>) => effect`,
      filename: 'audit-inflight.state.ts',
    },
    {
      name: 'Should_Pass_When_ExportedTagClass',
      code:
        `export class AuditInFlight extends Context.Tag('AuditInFlight')<AuditInFlight, { readonly joinInFlight: (id: string, effect: Effect<Report>) => Effect<Report> }>() {}`,
      filename: 'audit-inflight.state.ts',
    },
    {
      name: 'Should_Pass_When_ExportedLiveLayerMemberCall',
      code: `const inFlight = new Map<string, Deferred<Report>>()
export const AuditInFlightLive = AuditInFlight.of({ joinInFlight: (id: string, effect: Effect<Report>) => effect })`,
      filename: 'audit-inflight.state.ts',
    },
    {
      name: 'Should_Pass_When_ExportedNonPrimitiveConstructor',
      code: `export const registry = new Registry()`,
      filename: 'registry.state.ts',
    },
    {
      name: 'Should_Pass_When_ExportedRefMake',
      code: `export const counter = Ref.make(0)`,
      filename: 'counter.state.ts',
    },
    {
      name: 'Should_Pass_When_ExportedIdentifierCall',
      code: `export const registry = makeRegistry()`,
      filename: 'registry.state.ts',
    },
    {
      name: 'Should_Pass_When_ExportedMemberCallFromCall',
      code: `export const entry = getMap().get('key')`,
      filename: 'registry.state.ts',
    },
    {
      name: 'Should_Pass_When_ExportedTypeAlias',
      code: `export type LockTable = Map<string, Deferred<void>>`,
      filename: 'lock.state.ts',
    },
    {
      name: 'Should_Pass_When_RawExport_When_ExecutorFile',
      code: `export const inFlight = new Map<string, string>()`,
      filename: 'audit-inflight.executor.ts',
    },
    {
      name: 'Should_Pass_When_RawExport_When_WorkflowFile',
      code: `export const inFlight = new Map<string, string>()`,
      filename: 'audit-inflight.workflow.ts',
    },
    {
      name: 'Should_Pass_When_DefaultExportedManagedRuntimeIdentifier',
      code: `const runtime = ManagedRuntime.make(Layer.empty)
export default runtime`,
      filename: 'hook-runtime.state.ts',
    },
    {
      name: 'Should_Pass_When_DefaultExportedManagedRuntimeExpression',
      code: `export default ManagedRuntime.make(Layer.empty)`,
      filename: 'hook-runtime.state.ts',
    },
    {
      name: 'Should_Pass_When_NamedExportedLayerToRuntime',
      code: `export const runtime = Layer.toRuntime(Layer.empty)`,
      filename: 'hook-runtime.state.ts',
    },
    {
      name: 'Should_Pass_When_RuntimeHandleExportedViaSpecifier',
      code: `const runtime = ManagedRuntime.make(Layer.empty)
export { runtime }`,
      filename: 'hook-runtime.state.ts',
    },
    {
      name: 'Should_Pass_When_ClassExtendsNonPrimitiveMember_When_NotPrimitive',
      code: `class Worker extends Other.Reference {}
export { Worker }`,
      filename: 'worker.state.ts',
    },
    {
      name: 'Should_Pass_When_ExportedContextReferenceFunctionForm',
      code:
        `export const LeaderConfig = Context.Reference<SupervisionConfig>('@x/LeaderConfig', { defaultValue: () => defaults })`,
      filename: 'leader-config.state.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_RawMapExport_When_ExportedMap',
      code: `export const inFlight = new Map<string, Deferred<Report>>()`,
      filename: 'audit-inflight.state.ts',
      errors: [{ messageId: 'rawPrimitiveExport', data: rawPrimitiveExportData('inFlight', 'Map') }],
    },
    {
      name: 'Should_Report_RawSetExport_When_ExportedSet',
      code: `export const presence = new Set<string>()`,
      filename: 'presence.state.ts',
      errors: [{ messageId: 'rawPrimitiveExport', data: rawPrimitiveExportData('presence', 'Set') }],
    },
    {
      name: 'Should_Report_RawWeakMapExport_When_ExportedWeakMap',
      code: `export const leases = new WeakMap<object, number>()`,
      filename: 'leases.state.ts',
      errors: [{ messageId: 'rawPrimitiveExport', data: rawPrimitiveExportData('leases', 'WeakMap') }],
    },
    {
      name: 'Should_Report_RawSemaphoreExport_When_ExportedSemaphoreConstructor',
      code: `export const limiter = new Semaphore(1)`,
      filename: 'limiter.state.ts',
      errors: [{ messageId: 'rawPrimitiveExport', data: rawPrimitiveExportData('limiter', 'Semaphore') }],
    },
    {
      name: 'Should_Report_RawRefExport_When_ExportedRefUnsafeMake',
      code: `export const counter = Ref.unsafeMake(0)`,
      filename: 'counter.state.ts',
      errors: [{ messageId: 'rawPrimitiveExport', data: rawPrimitiveExportData('counter', 'Ref.unsafeMake') }],
    },
    {
      name: 'Should_Report_RawDeferredExport_When_ExportedDeferredUnsafeMake',
      code: `export const gate = Deferred.unsafeMake<Report>()`,
      filename: 'gate.state.ts',
      errors: [{ messageId: 'rawPrimitiveExport', data: rawPrimitiveExportData('gate', 'Deferred.unsafeMake') }],
    },
    {
      name: 'Should_Report_RawTRefExport_When_ExportedTRefUnsafeMake',
      code: `export const balance = TRef.unsafeMake(0)`,
      filename: 'balance.state.ts',
      errors: [{ messageId: 'rawPrimitiveExport', data: rawPrimitiveExportData('balance', 'TRef.unsafeMake') }],
    },
    {
      name: 'Should_Report_RawRefExport_When_ExportedRefMakeUnsafe',
      code: `export const counter = Ref.makeUnsafe(0)`,
      filename: 'counter.state.ts',
      errors: [{ messageId: 'rawPrimitiveExport', data: rawPrimitiveExportData('counter', 'Ref.makeUnsafe') }],
    },
    {
      name: 'Should_Report_RawDeferredExport_When_ExportedDeferredMakeUnsafe',
      code: `export const gate = Deferred.makeUnsafe<Report>()`,
      filename: 'gate.state.ts',
      errors: [{ messageId: 'rawPrimitiveExport', data: rawPrimitiveExportData('gate', 'Deferred.makeUnsafe') }],
    },
    {
      name: 'Should_Report_RawSemaphoreExport_When_ExportedSemaphoreMakeUnsafe',
      code: `export const limiter = Semaphore.makeUnsafe(1)`,
      filename: 'limiter.state.ts',
      errors: [{ messageId: 'rawPrimitiveExport', data: rawPrimitiveExportData('limiter', 'Semaphore.makeUnsafe') }],
    },
    {
      name: 'Should_Report_RawTxRefExport_When_ExportedTxRefMakeUnsafe',
      code: `export const balance = TxRef.makeUnsafe(0)`,
      filename: 'balance.state.ts',
      errors: [{ messageId: 'rawPrimitiveExport', data: rawPrimitiveExportData('balance', 'TxRef.makeUnsafe') }],
    },
    {
      name: 'Should_Report_RawMapExport_When_ExportedViaSpecifier',
      code: `const inFlight = new Map<string, Deferred<Report>>()
export { inFlight }`,
      filename: 'audit-inflight.state.ts',
      errors: [{ messageId: 'rawPrimitiveExport', data: rawPrimitiveExportData('inFlight', 'Map') }],
    },
    {
      name: 'Should_Report_RawMapExport_When_ExportedViaRenamedSpecifier',
      code: `const inFlight = new Map<string, Deferred<Report>>()
export { inFlight as registry }`,
      filename: 'audit-inflight.state.ts',
      errors: [{ messageId: 'rawPrimitiveExport', data: rawPrimitiveExportData('inFlight', 'Map') }],
    },
    {
      name: 'Should_Report_RawMapExport_When_DefaultExportedIdentifier',
      code: `const registry = new Map<string, string>()
export default registry`,
      filename: 'registry.state.ts',
      errors: [{ messageId: 'rawPrimitiveExport', data: rawPrimitiveExportData('registry', 'Map') }],
    },
    {
      name: 'Should_Report_RawMapExport_When_DefaultExportedExpression',
      code: `export default new Map<string, string>()`,
      filename: 'registry.state.ts',
      errors: [{ messageId: 'rawPrimitiveExport', data: rawPrimitiveExportData('default export', 'Map') }],
    },
    {
      name: 'Should_Report_RawPrimitiveExports_When_MultipleExports',
      code: `export const a = new Map<string, string>()
export const b = new Set<string>()`,
      filename: 'registry.state.ts',
      errors: [
        { messageId: 'rawPrimitiveExport', data: rawPrimitiveExportData('a', 'Map') },
        { messageId: 'rawPrimitiveExport', data: rawPrimitiveExportData('b', 'Set') },
      ],
    },
    {
      name: 'Should_Report_RawMapExport_When_DefaultAndNamedExport',
      code: `export const inFlight = new Map<string, string>()
export default new Set<string>()`,
      filename: 'registry.state.ts',
      errors: [
        { messageId: 'rawPrimitiveExport', data: rawPrimitiveExportData('inFlight', 'Map') },
        { messageId: 'rawPrimitiveExport', data: rawPrimitiveExportData('default export', 'Set') },
      ],
    },
    {
      name: 'Should_Report_RawMapExport_When_ExportedAlongsideRuntimeHandle',
      code: `export const runtime = ManagedRuntime.make(Layer.empty)
export const inFlight = new Map<string, string>()`,
      filename: 'hook-runtime.state.ts',
      errors: [{ messageId: 'rawPrimitiveExport', data: rawPrimitiveExportData('inFlight', 'Map') }],
    },
    {
      name: 'Should_Report_ClassSuperExport_When_ClassExtendsContextReference',
      code:
        `class WorkerConfig extends Context.Reference<WorkerConfig>()('WorkerConfig', { defaultValue: () => defaults }) {}
export { WorkerConfig }`,
      filename: 'worker-config.state.ts',
      errors: [{ messageId: 'rawPrimitiveExport', data: rawPrimitiveExportData('WorkerConfig', 'Context.Reference') }],
    },
  ],
})
