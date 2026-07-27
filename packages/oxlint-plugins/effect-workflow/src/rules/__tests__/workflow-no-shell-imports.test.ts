import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { workflowNoShellImports } from '../workflow-no-shell-imports.js'

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

ruleTester.run('workflow-no-shell-imports', workflowNoShellImports, {
  valid: [
    {
      name: 'Should_Allow_EffectEither_When_WorkflowFile',
      code: `import * as Either from 'effect/Either'`,
      filename: 'cancel-order.workflow.ts',
    },
    {
      name: 'Should_Allow_SchemaImport_When_WorkflowFile',
      code: `import { OrderId } from './order-id.schema'`,
      filename: 'cancel-order.workflow.ts',
    },
    {
      name: 'Should_Allow_SharedModule_When_WorkflowFile',
      code: `import { Money } from '../shared/money'`,
      filename: 'cancel-order.workflow.ts',
    },
    {
      name: 'Should_Allow_EffectSchema_When_WorkflowFile',
      code: `import * as S from 'effect/Schema'`,
      filename: 'cancel-order.workflow.ts',
    },
    {
      name: 'Should_Allow_RestoreNearMiss_When_WorkflowFile',
      code: `import { restore } from './restore'`,
      filename: 'cancel-order.workflow.ts',
    },
    {
      name: 'Should_Allow_AdaptersNearMiss_When_WorkflowFile',
      code: `import { adapters } from './adapters'`,
      filename: 'cancel-order.workflow.ts',
    },
    {
      name: 'Should_Ignore_RuntimeImport_When_HandlerFile',
      code: `import fs from 'fs'`,
      filename: 'cancel-order.handler.ts',
    },
    {
      name: 'Should_Ignore_StoreImport_When_ExecutorFile',
      code: `import { saveOrder } from './order.store'`,
      filename: 'cancel-order.executor.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_StoreImport_When_WorkflowFile',
      code: `import { saveOrder } from './order.store'`,
      filename: 'cancel-order.workflow.ts',
      errors: [
        {
          messageId: 'shellCellImport',
          data: {
            name: './order.store',
            expected: 'imports of pure domain modules only',
            actual: 'an import of the .store cell',
            fix: 'the shell owns I/O — pass the value in as command data, or move this decision to the executor',
          },
        },
      ],
    },
    {
      name: 'Should_Report_AdapterImportWithExtension_When_WorkflowFile',
      code: `import { chargeCard } from './stripe.adapter.js'`,
      filename: 'cancel-order.workflow.ts',
      errors: [
        {
          messageId: 'shellCellImport',
          data: {
            name: './stripe.adapter.js',
            expected: 'imports of pure domain modules only',
            actual: 'an import of the .adapter cell',
            fix: 'the shell owns I/O — pass the value in as command data, or move this decision to the executor',
          },
        },
      ],
    },
    {
      name: 'Should_Report_NodeCryptoImport_When_WorkflowFile',
      code: `import { createHash } from 'node:crypto'`,
      filename: 'cancel-order.workflow.ts',
      errors: [
        {
          messageId: 'runtimeModuleImport',
          data: {
            name: 'node:crypto',
            expected: 'a pure decision with no runtime dependencies',
            actual: 'an import of the Node runtime module node:crypto',
            fix: 'read the value in the shell and pass it as a command field',
          },
        },
      ],
    },
    {
      name: 'Should_Report_BareFsImport_When_WorkflowFile',
      code: `import fs from 'fs'`,
      filename: 'cancel-order.workflow.ts',
      errors: [
        {
          messageId: 'runtimeModuleImport',
          data: {
            name: 'fs',
            expected: 'a pure decision with no runtime dependencies',
            actual: 'an import of the Node runtime module fs',
            fix: 'read the value in the shell and pass it as a command field',
          },
        },
      ],
    },
    {
      name: 'Should_Report_ExecutorImportWithTsExtension_When_WorkflowFile',
      code: `import { runPayment } from './payment.executor.ts'`,
      filename: 'cancel-order.workflow.ts',
      errors: [
        {
          messageId: 'shellCellImport',
          data: {
            name: './payment.executor.ts',
            expected: 'imports of pure domain modules only',
            actual: 'an import of the .executor cell',
            fix: 'the shell owns I/O — pass the value in as command data, or move this decision to the executor',
          },
        },
      ],
    },
  ],
})
