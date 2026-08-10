import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { BARREL_EXPECTED, BARREL_FIX } from '../no-barrel-import-in-cell.config.js'
import { noBarrelImportInCell } from '../no-barrel-import-in-cell.js'

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

const executorActual = 'a directory barrel in the .executor cell, whose contents the table cannot see'
const workflowActual = 'a directory barrel in the .workflow cell, whose contents the table cannot see'
const typeActual = 'a directory barrel in the .type cell, whose contents the table cannot see'

ruleTester.run('no-barrel-import-in-cell', noBarrelImportInCell, {
  valid: [
    {
      name: 'Should_Pass_When_ExecutorImportsLeafCellFromSiblingDirectory',
      code: `import { x } from '../Lock/leader-lock.adapter.js'

export const run = x`,
      filename: 'src/a.executor.ts',
    },
    {
      name: 'Should_Pass_When_TestFileImportsDirectoryBarrel',
      code: `import { x } from '../Lock/index.js'

export const probe = x`,
      filename: 'src/a.test.ts',
    },
    {
      name: 'Should_Pass_When_IntegrationTestImportsDirectoryBarrel',
      code: `import { x } from '../Lock/index.js'

export const probe = x`,
      filename: 'src/a.integration.test.ts',
    },
    {
      name: 'Should_Pass_When_CellImportsExternalPackage',
      code: `import * as effect from 'effect'

export const run = effect`,
      filename: 'src/a.executor.ts',
    },
    {
      name: 'Should_Pass_When_CellImportsExternalPackageSubpath',
      code: `import { Effect } from 'effect/Effect'

export const run = Effect`,
      filename: 'src/a.executor.ts',
    },
    {
      name: 'Should_Pass_When_ExecutorImportsLeafCellWithoutExtension',
      code: `import { x } from '../Lock/leader-lock.adapter'

export const run = x`,
      filename: 'src/a.executor.ts',
    },
    {
      name: 'Should_Pass_When_CellImportsLeafFileWithoutCellSuffix',
      code: `import { helper } from './local-helper.js'

export const run = helper`,
      filename: 'src/a.executor.ts',
    },
    {
      name: 'Should_Pass_When_ObserverImportsDirectoryBarrel',
      code: `import { x } from './probe/index.js'

export const probe = x`,
      filename: 'src/probe.observer.ts',
    },
    {
      name: 'Should_Pass_When_SuffixlessFileImportsDirectoryBarrel',
      code: `import { x } from './Lock/index.js'

export const run = x`,
      filename: 'src/plain.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_ExecutorImportsSiblingDirectoryBarrel',
      code: `import { x } from '../Lock/index.js'

export const run = x`,
      filename: 'src/a.executor.ts',
      errors: [{
        messageId: 'barrelImport',
        data: {
          name: '../Lock/index.js',
          expected: BARREL_EXPECTED,
          actual: executorActual,
          fix: BARREL_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_When_CellImportsSameDirectoryModBarrel',
      code: `import { x } from './mod.js'

export const run = x`,
      filename: 'src/a.executor.ts',
      errors: [{
        messageId: 'barrelImport',
        data: {
          name: './mod.js',
          expected: BARREL_EXPECTED,
          actual: executorActual,
          fix: BARREL_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_When_ExecutorImportsBarrelWithoutExtension',
      code: `import { x } from '../Lock/index'

export const run = x`,
      filename: 'src/a.executor.ts',
      errors: [{
        messageId: 'barrelImport',
        data: {
          name: '../Lock/index',
          expected: BARREL_EXPECTED,
          actual: executorActual,
          fix: BARREL_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_When_ExecutorImportsDirectoryStyleSpecifier',
      code: `import { x } from '../Lock'

export const run = x`,
      filename: 'src/a.executor.ts',
      errors: [{
        messageId: 'barrelImport',
        data: {
          name: '../Lock',
          expected: BARREL_EXPECTED,
          actual: executorActual,
          fix: BARREL_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_When_CellTypeImportsDirectoryBarrel',
      code: `import type { X } from '../Lock/index.js'

export type Y = X`,
      filename: 'src/a.executor.ts',
      errors: [{
        messageId: 'barrelImport',
        data: {
          name: '../Lock/index.js',
          expected: BARREL_EXPECTED,
          actual: executorActual,
          fix: BARREL_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_When_WorkflowReExportsDirectoryBarrel',
      code: `export * from './Lock/index.js'`,
      filename: 'src/a.workflow.ts',
      errors: [{
        messageId: 'barrelImport',
        data: {
          name: './Lock/index.js',
          expected: BARREL_EXPECTED,
          actual: workflowActual,
          fix: BARREL_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_When_ExecutorDynamicallyImportsDirectoryBarrel',
      code: `export const load = () => import('../Lock/index.js')`,
      filename: 'src/a.executor.ts',
      errors: [{
        messageId: 'barrelImport',
        data: {
          name: '../Lock/index.js',
          expected: BARREL_EXPECTED,
          actual: executorActual,
          fix: BARREL_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_When_TypeCellImportsDirectoryBarrel',
      code: `import { x } from '../Lock/index.js'

export type Y = x`,
      filename: 'src/a.type.ts',
      errors: [{
        messageId: 'barrelImport',
        data: {
          name: '../Lock/index.js',
          expected: BARREL_EXPECTED,
          actual: typeActual,
          fix: BARREL_FIX,
        },
      }],
    },
  ],
})
