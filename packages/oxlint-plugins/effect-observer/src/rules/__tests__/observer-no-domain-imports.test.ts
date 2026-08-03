import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import {
  DOMAIN_IMPORT_ACTUAL,
  DOMAIN_IMPORT_EXPECTED,
  DOMAIN_IMPORT_FIX,
} from '../observer-no-domain-imports.config.js'
import { observerNoDomainImports } from '../observer-no-domain-imports.js'

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

const DOMAIN_SUFFIXES = [
  'schema',
  'workflow',
  'executor',
  'store',
  'acl',
  'adapter',
  'handler',
  'middleware',
  'policy',
  'state',
  'shape',
] as const

ruleTester.run('observer-no-domain-imports', observerNoDomainImports, {
  valid: [
    {
      name: 'Should_Pass_When_ImportingEffectSubmodule',
      code: `import { Schema as S } from 'effect/Schema'`,
      filename: 'step-harness.observer.ts',
    },
    {
      name: 'Should_Pass_When_ImportingEffectBarrel',
      code: `import { Effect } from 'effect'`,
      filename: 'step-harness.observer.ts',
    },
    {
      name: 'Should_Pass_When_ImportingObserverSibling',
      code: `import { runSteps } from '../run-steps.observer.js'`,
      filename: 'step-harness.observer.ts',
    },
    {
      name: 'Should_Pass_When_ImportingKernelModule',
      code: `import { combine } from '../combine.kernel.js'`,
      filename: 'step-harness.observer.ts',
    },
    {
      name: 'Should_Pass_When_ImportingPlainHelper',
      code: `import { waitFor } from './wait-for.js'`,
      filename: 'step-harness.observer.ts',
    },
    {
      name: 'Should_Pass_When_ImportingNodeModule',
      code: `import { readFile } from 'node:fs'`,
      filename: 'step-harness.observer.ts',
    },
    {
      name: 'Should_Pass_When_ImportingSuffixNamedPlainFile',
      code: `import { x } from '../orders/order-schema.ts'`,
      filename: 'step-harness.observer.ts',
    },
    {
      name: 'Should_Pass_When_SourceEndsWithSuffixThenExtraExtension',
      code: `import { x } from '../orders/order.schema.foo.ts'`,
      filename: 'step-harness.observer.ts',
    },
    {
      name: 'Should_Pass_When_ExportingWithoutSource',
      code: `const runSteps = 1

export { runSteps }`,
      filename: 'step-harness.observer.ts',
    },
    {
      name: 'Should_Pass_When_DomainImportInNonObserverFile',
      code: `import { Order } from '../orders/order.schema'`,
      filename: 'cancel-order.workflow.ts',
    },
  ],
  invalid: [
    ...DOMAIN_SUFFIXES.map((suffix) => ({
      name: `Should_Report_When_ImportingDomainCell_${suffix}`,
      code: `import { thing } from '../orders/order.${suffix}'`,
      filename: 'step-harness.observer.ts',
      errors: [{
        messageId: 'domainCellImport',
        data: {
          name: `../orders/order.${suffix}`,
          expected: DOMAIN_IMPORT_EXPECTED,
          actual: DOMAIN_IMPORT_ACTUAL,
          fix: DOMAIN_IMPORT_FIX,
        },
      }],
    })),
    {
      name: 'Should_Report_When_ImportingDomainCellWithTsExtension',
      code: `import { Order } from '../orders/order.schema.ts'`,
      filename: 'step-harness.observer.ts',
      errors: [{
        messageId: 'domainCellImport',
        data: {
          name: '../orders/order.schema.ts',
          expected: DOMAIN_IMPORT_EXPECTED,
          actual: DOMAIN_IMPORT_ACTUAL,
          fix: DOMAIN_IMPORT_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_When_TypeImportingDomainCell',
      code: `import type { Order } from '../orders/order.schema'`,
      filename: 'step-harness.observer.ts',
      errors: [{
        messageId: 'domainCellImport',
        data: {
          name: '../orders/order.schema',
          expected: DOMAIN_IMPORT_EXPECTED,
          actual: DOMAIN_IMPORT_ACTUAL,
          fix: DOMAIN_IMPORT_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_When_ReexportingDomainCell',
      code: `export { Order } from '../orders/order.schema'`,
      filename: 'step-harness.observer.ts',
      errors: [{
        messageId: 'domainCellImport',
        data: {
          name: '../orders/order.schema',
          expected: DOMAIN_IMPORT_EXPECTED,
          actual: DOMAIN_IMPORT_ACTUAL,
          fix: DOMAIN_IMPORT_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_When_ReexportingAllDomainCell',
      code: `export * from '../orders/order.schema'`,
      filename: 'step-harness.observer.ts',
      errors: [{
        messageId: 'domainCellImport',
        data: {
          name: '../orders/order.schema',
          expected: DOMAIN_IMPORT_EXPECTED,
          actual: DOMAIN_IMPORT_ACTUAL,
          fix: DOMAIN_IMPORT_FIX,
        },
      }],
    },
  ],
})
