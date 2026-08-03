import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { DOMAIN_IMPORT_ACTUAL, DOMAIN_IMPORT_EXPECTED, DOMAIN_IMPORT_FIX } from '../shape-no-domain-import.config.js'
import { shapeNoDomainImport } from '../shape-no-domain-import.js'

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

ruleTester.run('shape-no-domain-import', shapeNoDomainImport, {
  valid: [
    {
      name: 'Should_Pass_When_ImportingForeignPackage',
      code: `import * as memfs from 'memfs'\nexport type Contents = memfs.DirectoryJSON`,
      filename: 'memory-file-system.shape.ts',
    },
    {
      name: 'Should_Pass_When_ImportingSameSystemShapeSibling',
      code: `import type { Contents } from './user.shape.js'`,
      filename: 'order.shape.ts',
    },
    {
      name: 'Should_Pass_When_ImportingPlainRelativeModule',
      code: `import { Columns } from './shared/columns.js'`,
      filename: 'order.shape.ts',
    },
    {
      name: 'Should_Pass_When_ImportingFileNamedSchemaWithoutDotSuffix',
      code: `import { x } from './schema.js'`,
      filename: 'order.shape.ts',
    },
    {
      name: 'Should_Pass_When_SourceEndsWithSchemaeNearMiss',
      code: `import { x } from './order.schemae.js'`,
      filename: 'order.shape.ts',
    },
    {
      name: 'Should_Pass_When_SourceEndsWithSchemaJsonNearMiss',
      code: `import x from './order.schema.json'`,
      filename: 'order.shape.ts',
    },
    {
      name: 'Should_Pass_When_ShapeFileHasNoImports',
      code: `export interface Row { readonly id: string }`,
      filename: 'order.shape.ts',
    },
    {
      name: 'Should_Pass_When_WorkflowFileImportsSchemaSibling',
      code: `import { OrderId } from './order.schema.js'`,
      filename: 'process-claim.workflow.ts',
    },
    {
      name: 'Should_Pass_When_ExecutorFileImportsSchemaSibling',
      code: `import { OrderId } from './order.schema.js'`,
      filename: 'submit-order.executor.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_ImportingSchemaSiblingTs',
      code: `import { OrderId } from './order.schema.ts'`,
      filename: 'order.shape.ts',
      errors: [{
        messageId: 'domainImport',
        data: {
          name: './order.schema.ts',
          expected: DOMAIN_IMPORT_EXPECTED,
          actual: DOMAIN_IMPORT_ACTUAL,
          fix: DOMAIN_IMPORT_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_When_ImportingSchemaSiblingJs',
      code: `import { OrderId } from '../shared/order.schema.js'`,
      filename: 'order.shape.ts',
      errors: [{
        messageId: 'domainImport',
        data: {
          name: '../shared/order.schema.js',
          expected: DOMAIN_IMPORT_EXPECTED,
          actual: DOMAIN_IMPORT_ACTUAL,
          fix: DOMAIN_IMPORT_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_When_ImportingBareSchemaSibling',
      code: `import { OrderId } from './order.schema'`,
      filename: 'order.shape.ts',
      errors: [{
        messageId: 'domainImport',
        data: {
          name: './order.schema',
          expected: DOMAIN_IMPORT_EXPECTED,
          actual: DOMAIN_IMPORT_ACTUAL,
          fix: DOMAIN_IMPORT_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_When_ImportingWorkflowSibling',
      code: `import { cancelOrder } from './cancel-order.workflow.js'`,
      filename: 'order.shape.ts',
      errors: [{
        messageId: 'domainImport',
        data: {
          name: './cancel-order.workflow.js',
          expected: DOMAIN_IMPORT_EXPECTED,
          actual: DOMAIN_IMPORT_ACTUAL,
          fix: DOMAIN_IMPORT_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_When_ImportingStoreSibling',
      code: `import { OrderStore } from './order.store.js'`,
      filename: 'order.shape.ts',
      errors: [{
        messageId: 'domainImport',
        data: {
          name: './order.store.js',
          expected: DOMAIN_IMPORT_EXPECTED,
          actual: DOMAIN_IMPORT_ACTUAL,
          fix: DOMAIN_IMPORT_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_When_ImportingAclSibling',
      code: `import { OrderRowToDomain } from './order.acl.js'`,
      filename: 'order.shape.ts',
      errors: [{
        messageId: 'domainImport',
        data: {
          name: './order.acl.js',
          expected: DOMAIN_IMPORT_EXPECTED,
          actual: DOMAIN_IMPORT_ACTUAL,
          fix: DOMAIN_IMPORT_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_When_ImportingCellWithMtsExtension',
      code: `import { x } from './order.store.mts'`,
      filename: 'order.shape.ts',
      errors: [{
        messageId: 'domainImport',
        data: {
          name: './order.store.mts',
          expected: DOMAIN_IMPORT_EXPECTED,
          actual: DOMAIN_IMPORT_ACTUAL,
          fix: DOMAIN_IMPORT_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_When_ReExportingSchemaSibling',
      code: `export * from './order.schema.js'`,
      filename: 'order.shape.ts',
      errors: [{
        messageId: 'domainImport',
        data: {
          name: './order.schema.js',
          expected: DOMAIN_IMPORT_EXPECTED,
          actual: DOMAIN_IMPORT_ACTUAL,
          fix: DOMAIN_IMPORT_FIX,
        },
      }],
    },
  ],
})
