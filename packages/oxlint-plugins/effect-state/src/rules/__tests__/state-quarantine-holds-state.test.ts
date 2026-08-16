import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { stateQuarantineHoldsState } from '../state-quarantine-holds-state.js'

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

const noStatePrimitiveData = {
  name: 'state cell',
  expected:
    'at least one module-scope construction of an escaping coordination primitive (new Map/Set/WeakMap/WeakSet/Semaphore, Ref.unsafeMake/Ref.makeUnsafe, Deferred.unsafeMake/Deferred.makeUnsafe, Semaphore.make/Semaphore.makeUnsafe, TRef.unsafeMake/TxRef.makeUnsafe, ManagedRuntime.make, Layer.toRuntime, Context.Reference, or a class extending Context.Reference)',
  actual: 'no escaping live state at module scope',
  fix:
    'construct the escaping Map/Ref/Deferred/Semaphore/Runtime at module scope in this *.state.ts, or move the file to the cell that owns its actual content',
}

ruleTester.run('state-quarantine-holds-state', stateQuarantineHoldsState, {
  valid: [
    {
      name: 'Should_Pass_When_PrivateModuleScopeMapBesideTagAndLive',
      code: `const inFlight = new Map<string, Deferred<Report>>()
export const AuditInFlightLive = AuditInFlight.of({ joinInFlight: (id: string, effect: Effect<Report>) => effect })`,
      filename: 'audit-inflight.state.ts',
    },
    {
      name: 'Should_Pass_When_ExportedModuleScopeMapInStateFile',
      code: `export const inFlight = new Map<string, Deferred<Report>>()`,
      filename: 'audit-inflight.state.ts',
    },
    {
      name: 'Should_Pass_When_ModuleScopeSetInStateFile',
      code: `const presence = new Set<string>()`,
      filename: 'presence.state.ts',
    },
    {
      name: 'Should_Pass_When_ModuleScopeWeakMapInStateFile',
      code: `const leases = new WeakMap<object, number>()`,
      filename: 'leases.state.ts',
    },
    {
      name: 'Should_Pass_When_ClassExtendsContextReferenceInStateFile',
      code:
        `export class WorkerConfig extends Context.Reference<WorkerConfig>()('WorkerConfig', { defaultValue: () => defaults }) {}`,
      filename: 'worker-config.state.ts',
    },
    {
      name: 'Should_Pass_When_UnexportedClassExtendsContextReferenceInStateFile',
      code:
        `class LeaderConfig extends Context.Reference<LeaderConfig>()('LeaderConfig', { defaultValue: () => defaults }) {}`,
      filename: 'leader-config.state.ts',
    },
    {
      name: 'Should_Pass_When_ModuleScopeWeakSetInStateFile',
      code: `const seen = new WeakSet<object>()`,
      filename: 'seen.state.ts',
    },
    {
      name: 'Should_Pass_When_ModuleScopeSemaphoreConstructorInStateFile',
      code: `const limiter = new Semaphore(1)`,
      filename: 'limiter.state.ts',
    },
    {
      name: 'Should_Pass_When_ModuleScopeRefUnsafeMakeInStateFile',
      code: `const counter = Ref.unsafeMake(0)`,
      filename: 'counter.state.ts',
    },
    {
      name: 'Should_Pass_When_ModuleScopeDeferredUnsafeMakeInStateFile',
      code: `const gate = Deferred.unsafeMake<Report>()`,
      filename: 'gate.state.ts',
    },
    {
      name: 'Should_Pass_When_ModuleScopeSemaphoreMakeInStateFile',
      code: `const limiter = Semaphore.make(1)`,
      filename: 'limiter.state.ts',
    },
    {
      name: 'Should_Pass_When_ModuleScopeTRefUnsafeMakeInStateFile',
      code: `const balance = TRef.unsafeMake(0)`,
      filename: 'balance.state.ts',
    },
    {
      name: 'Should_Pass_When_ModuleScopeRefMakeUnsafeInStateFile',
      code: `const counter = Ref.makeUnsafe(0)`,
      filename: 'counter.state.ts',
    },
    {
      name: 'Should_Pass_When_ModuleScopeDeferredMakeUnsafeInStateFile',
      code: `const gate = Deferred.makeUnsafe<Report>()`,
      filename: 'gate.state.ts',
    },
    {
      name: 'Should_Pass_When_ModuleScopeSemaphoreMakeUnsafeInStateFile',
      code: `const limiter = Semaphore.makeUnsafe(1)`,
      filename: 'limiter.state.ts',
    },
    {
      name: 'Should_Pass_When_ModuleScopeTxRefMakeUnsafeInStateFile',
      code: `const balance = TxRef.makeUnsafe(0)`,
      filename: 'balance.state.ts',
    },
    {
      name: 'Should_Pass_When_ModuleScopeContextReferenceFunctionFormInStateFile',
      code:
        `const LeaderConfig = Context.Reference<SupervisionConfig>('@x/LeaderConfig', { defaultValue: () => defaults })`,
      filename: 'leader-config.state.ts',
    },
    {
      name: 'Should_Pass_When_ExportedContextReferenceFunctionFormInStateFile',
      code:
        `export const LeaderConfig = Context.Reference<SupervisionConfig>('@x/LeaderConfig', { defaultValue: () => defaults })`,
      filename: 'leader-config.state.ts',
    },
    {
      name: 'Should_Pass_When_ExportDefaultMapInStateFile',
      code: `export default new Map<string, Deferred<Report>>()`,
      filename: 'audit-inflight.state.ts',
    },
    {
      name: 'Should_Pass_When_FunctionDeclarationBesideModuleScopeMap',
      code: `function makeRegistry() { return new Map<string, string>() }
const inFlight = new Map<string, Deferred<Report>>()`,
      filename: 'audit-inflight.state.ts',
    },
    {
      name: 'Should_Pass_When_ModuleScopeManagedRuntimeMakeInStateFile',
      code: `const runtime = ManagedRuntime.make(Layer.empty)`,
      filename: 'runtime.state.ts',
    },
    {
      name: 'Should_Pass_When_ModuleScopeLayerToRuntimeInStateFile',
      code: `const runtime = Layer.toRuntime(Layer.empty)`,
      filename: 'runtime.state.ts',
    },
    {
      name: 'Should_Pass_When_NoState_When_ExecutorFile',
      code: `export const run = () => new Map<string, string>()`,
      filename: 'audit-inflight.executor.ts',
    },
    {
      name: 'Should_Pass_When_NoState_When_WorkflowFile',
      code: `export const decide = () => Either.right(ok)`,
      filename: 'audit-inflight.workflow.ts',
    },
    {
      name: 'Should_Pass_When_NoState_When_HandlerFile',
      code: `export const handle = () => 'ok'`,
      filename: 'audit-inflight.handler.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_NoStatePrimitive_When_TagAndLiveWithOperationLocalState',
      code:
        `export class AuditInFlight extends Context.Tag('AuditInFlight')<AuditInFlight, { readonly joinInFlight: (id: string, effect: Effect<Report>) => Effect<Report> }>() {}
export const AuditInFlightLive = AuditInFlight.of({
  joinInFlight: (id: string, effect: Effect<Report>) => Effect.gen(function*() {
    const pending = yield* Ref.make(new Map<string, Deferred<Report>>())
    return yield* effect
  }),
})`,
      filename: 'audit-inflight.state.ts',
      errors: [{ messageId: 'noStatePrimitive', data: noStatePrimitiveData }],
    },
    {
      name: 'Should_Report_NoStatePrimitive_When_StateInsideArrowFunction',
      code: `const makeRegistry = () => new Map<string, Deferred<Report>>()`,
      filename: 'audit-inflight.state.ts',
      errors: [{ messageId: 'noStatePrimitive', data: noStatePrimitiveData }],
    },
    {
      name: 'Should_Report_NoStatePrimitive_When_StateInsideFunctionDeclaration',
      code: `function withLock(key: string, effect: Effect<void>) { const held = new Set<string>(); return effect }`,
      filename: 'lock.state.ts',
      errors: [{ messageId: 'noStatePrimitive', data: noStatePrimitiveData }],
    },
    {
      name: 'Should_Report_NoStatePrimitive_When_NonPrimitiveConstructor',
      code: `const registry = new Registry()`,
      filename: 'registry.state.ts',
      errors: [{ messageId: 'noStatePrimitive', data: noStatePrimitiveData }],
    },
    {
      name: 'Should_Report_NoStatePrimitive_When_RefMakeReturnsEffect',
      code: `const counter = Ref.make(0)`,
      filename: 'counter.state.ts',
      errors: [{ messageId: 'noStatePrimitive', data: noStatePrimitiveData }],
    },
    {
      name: 'Should_Report_NoStatePrimitive_When_TxRefMakeReturnsEffect',
      code: `const balance = TxRef.make(0)`,
      filename: 'balance.state.ts',
      errors: [{ messageId: 'noStatePrimitive', data: noStatePrimitiveData }],
    },
    {
      name: 'Should_Report_NoStatePrimitive_When_OnlyTypeDeclaration',
      code: `export type LockTable = Map<string, Deferred<void>>`,
      filename: 'lock.state.ts',
      errors: [{ messageId: 'noStatePrimitive', data: noStatePrimitiveData }],
    },
    {
      name: 'Should_Report_NoStatePrimitive_When_EmptyStateFile',
      code: ``,
      filename: 'empty.state.ts',
      errors: [{ messageId: 'noStatePrimitive', data: noStatePrimitiveData }],
    },
    {
      name: 'Should_Report_NoStatePrimitive_When_DefaultExportIsLiteral',
      code: `export default 0`,
      filename: 'runtime.state.ts',
      errors: [{ messageId: 'noStatePrimitive', data: noStatePrimitiveData }],
    },
  ],
})
