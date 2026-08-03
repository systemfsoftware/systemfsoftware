import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { kernelNoDomainImports } from '../kernel-no-domain-imports.js'

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

const domainCellData = (source: string, suffix: string) => ({
  name: source,
  expected: 'imports of other kernel modules and language/library primitives only',
  actual: `an import of the ${suffix} domain cell`,
  fix:
    'a kernel is domain-blind — pass the domain value in as a function argument or keep the import in the domain cell that owns it',
})

const runtimeModuleData = (source: string) => ({
  name: source,
  expected: 'language/library primitives only',
  actual: `an import of the Node runtime module ${source}`,
  fix: 'read the value in the executor or adapter and pass it into the kernel as an argument',
})

ruleTester.run('kernel-no-domain-imports', kernelNoDomainImports, {
  valid: [
    {
      name: 'Should_Pass_When_KernelImportsEffectEither',
      code: `import * as Either from 'effect/Either'`,
      filename: 'fold.kernel.ts',
    },
    {
      name: 'Should_Pass_When_KernelImportsEffectSchemaNamespace',
      code: `import * as S from 'effect/Schema'`,
      filename: 'fold.kernel.ts',
    },
    {
      name: 'Should_Pass_When_KernelImportsEffectBarrel',
      code: `import { Effect, Option, pipe } from 'effect'`,
      filename: 'fold.kernel.ts',
    },
    {
      name: 'Should_Pass_When_KernelImportsAnotherKernel',
      code: `import { sumBy } from './fold.kernel'`,
      filename: 'compose.kernel.ts',
    },
    {
      name: 'Should_Pass_When_KernelImportsKernelWithTsExtension',
      code: `import { sumBy } from './fold.kernel.ts'`,
      filename: 'compose.kernel.ts',
    },
    {
      name: 'Should_Pass_When_KernelImportsSharedModule',
      code: `import { Money } from '../shared/money'`,
      filename: 'fold.kernel.ts',
    },
    {
      name: 'Should_Pass_When_RestoreNearMiss',
      code: `import { restore } from './restore'`,
      filename: 'fold.kernel.ts',
    },
    {
      name: 'Should_Pass_When_AdaptersNearMiss',
      code: `import { adapters } from './adapters'`,
      filename: 'fold.kernel.ts',
    },
    {
      name: 'Should_Pass_When_HandlersCollectionNearMiss',
      code: `import { handlers } from './handlers'`,
      filename: 'fold.kernel.ts',
    },
    {
      name: 'Should_Pass_When_StateMachineLibraryIsNotStateCell',
      code: `import { createMachine } from 'xstate'`,
      filename: 'fold.kernel.ts',
    },
    {
      name: 'Should_Pass_When_KernelImportsTestFixtureModule',
      code: `import { makeInput } from '../fixtures/inputs'`,
      filename: 'fold.kernel.ts',
    },
    {
      name: 'Should_Pass_When_KernelFileHasNoImports',
      code: `export const x = 1`,
      filename: 'fold.kernel.ts',
    },
    {
      name: 'Should_Pass_When_WorkflowFileImportsStoreCell',
      code: `import { saveOrder } from './order.store'`,
      filename: 'cancel-order.workflow.ts',
    },
    {
      name: 'Should_Pass_When_ExecutorFileImportsRuntimeModule',
      code: `import fs from 'fs'`,
      filename: 'cancel-order.executor.ts',
    },
    {
      name: 'Should_Pass_When_HandlerFileImportsAclCell',
      code: `import { decodeRow } from './order-row.acl'`,
      filename: 'cancel-order.handler.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_StoreImport_When_KernelFile',
      code: `import { saveOrder } from './order.store'`,
      filename: 'fold.kernel.ts',
      errors: [{ messageId: 'domainCellImport', data: domainCellData('./order.store', '.store') }],
    },
    {
      name: 'Should_Report_AdapterImportWithExtension_When_KernelFile',
      code: `import { chargeCard } from './stripe.adapter.js'`,
      filename: 'fold.kernel.ts',
      errors: [{
        messageId: 'domainCellImport',
        data: domainCellData('./stripe.adapter.js', '.adapter'),
      }],
    },
    {
      name: 'Should_Report_ExecutorImportWithTsExtension_When_KernelFile',
      code: `import { runPayment } from './payment.executor.ts'`,
      filename: 'fold.kernel.ts',
      errors: [{
        messageId: 'domainCellImport',
        data: domainCellData('./payment.executor.ts', '.executor'),
      }],
    },
    {
      name: 'Should_Report_WorkflowImport_When_KernelFile',
      code: `import { decide } from './process-claim.workflow.js'`,
      filename: 'fold.kernel.ts',
      errors: [{
        messageId: 'domainCellImport',
        data: domainCellData('./process-claim.workflow.js', '.workflow'),
      }],
    },
    {
      name: 'Should_Report_SchemaImport_When_KernelFile',
      code: `import { OrderId } from './order-id.schema'`,
      filename: 'fold.kernel.ts',
      errors: [{
        messageId: 'domainCellImport',
        data: domainCellData('./order-id.schema', '.schema'),
      }],
    },
    {
      name: 'Should_Report_ShapeImport_When_KernelFile',
      code: `import type { OrderRow } from './order.shape'`,
      filename: 'fold.kernel.ts',
      errors: [{ messageId: 'domainCellImport', data: domainCellData('./order.shape', '.shape') }],
    },
    {
      name: 'Should_Report_StateImport_When_KernelFile',
      code: `import { registry } from './registry.state'`,
      filename: 'fold.kernel.ts',
      errors: [{ messageId: 'domainCellImport', data: domainCellData('./registry.state', '.state') }],
    },
    {
      name: 'Should_Report_AclImport_When_KernelFile',
      code: `import { decodeRow } from './order-row.acl'`,
      filename: 'fold.kernel.ts',
      errors: [{ messageId: 'domainCellImport', data: domainCellData('./order-row.acl', '.acl') }],
    },
    {
      name: 'Should_Report_HandlerImport_When_KernelFile',
      code: `import { onPost } from './order.handler'`,
      filename: 'fold.kernel.ts',
      errors: [{ messageId: 'domainCellImport', data: domainCellData('./order.handler', '.handler') }],
    },
    {
      name: 'Should_Report_MiddlewareImport_When_KernelFile',
      code: `import { gate } from './auth.middleware'`,
      filename: 'fold.kernel.ts',
      errors: [{
        messageId: 'domainCellImport',
        data: domainCellData('./auth.middleware', '.middleware'),
      }],
    },
    {
      name: 'Should_Report_PolicyImport_When_KernelFile',
      code: `import { bulkhead } from './bulkhead.policy'`,
      filename: 'fold.kernel.ts',
      errors: [{
        messageId: 'domainCellImport',
        data: domainCellData('./bulkhead.policy', '.policy'),
      }],
    },
    {
      name: 'Should_Report_ObserverImport_When_KernelFile',
      code: `import { traceIt } from './trace.observer'`,
      filename: 'fold.kernel.ts',
      errors: [{
        messageId: 'domainCellImport',
        data: domainCellData('./trace.observer', '.observer'),
      }],
    },
    {
      name: 'Should_Report_NodeCryptoImport_When_KernelFile',
      code: `import { createHash } from 'node:crypto'`,
      filename: 'fold.kernel.ts',
      errors: [{
        messageId: 'runtimeModuleImport',
        data: runtimeModuleData('node:crypto'),
      }],
    },
    {
      name: 'Should_Report_BareFsImport_When_KernelFile',
      code: `import fs from 'fs'`,
      filename: 'fold.kernel.ts',
      errors: [{ messageId: 'runtimeModuleImport', data: runtimeModuleData('fs') }],
    },
    {
      name: 'Should_Report_FsPromisesImport_When_KernelFile',
      code: `import { readFile } from 'fs/promises'`,
      filename: 'fold.kernel.ts',
      errors: [{ messageId: 'runtimeModuleImport', data: runtimeModuleData('fs/promises') }],
    },
    {
      name: 'Should_Report_ChildProcessImport_When_KernelFile',
      code: `import { exec } from 'child_process'`,
      filename: 'fold.kernel.ts',
      errors: [{ messageId: 'runtimeModuleImport', data: runtimeModuleData('child_process') }],
    },
  ],
})
