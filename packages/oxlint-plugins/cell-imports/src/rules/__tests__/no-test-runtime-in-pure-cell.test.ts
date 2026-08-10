import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { TEST_RUNTIME_EXPECTED, TEST_RUNTIME_FIX } from '../no-test-runtime-in-pure-cell.config.js'
import { noTestRuntimeInPureCell } from '../no-test-runtime-in-pure-cell.js'

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

ruleTester.run('no-test-runtime-in-pure-cell', noTestRuntimeInPureCell, {
  valid: [
    {
      name: 'Should_Pass_When_KernelImportsVitestAsTypeOnly',
      code: `import type { TestAPI } from 'vitest'

export const tag = <T>(value: T): T => value

export const api: TestAPI | null = null`,
      filename: 'src/a.kernel.ts',
    },
    {
      name: 'Should_Pass_When_KernelImportsEffectVitestWithOnlyTypeSpecifiers',
      code: `import { type Vitest } from '@effect/vitest'

export const tag = <T>(value: T): T => value

export const api: Vitest | null = null`,
      filename: 'src/a.kernel.ts',
    },
    {
      name: 'Should_Pass_When_KernelImportsVitestDynamicallyInsideImportMetaVitestGuard',
      code: `export const tag = <T>(value: T): T => value

if (import.meta.vitest) {
  const { it } = await import('vitest')
  it('case', () => {})
}`,
      filename: 'src/a.kernel.ts',
    },
    {
      name: 'Should_Pass_When_KernelImportsVitestDynamicallyInsideVoidGuard',
      code: `export const tag = <T>(value: T): T => value

if (import.meta.vitest !== void 0) {
  const { it } = await import('vitest')
  it('case', () => {})
}`,
      filename: 'src/a.kernel.ts',
    },
    {
      name: 'Should_Pass_When_SchemaImportsEffectVitestDynamicallyInsideUndefinedGuard',
      code: `export interface Row { readonly id: string }

if (import.meta.vitest !== undefined) {
  const { it } = await import('@effect/vitest')
  it('case', () => {})
}`,
      filename: 'src/a.schema.ts',
    },
    {
      name: 'Should_Pass_When_ExecutorImportsVitest',
      code: `import { it } from 'vitest'

export const run = it`,
      filename: 'src/a.executor.ts',
    },
    {
      name: 'Should_Pass_When_KernelTestFileImportsVitest',
      code: `import { it } from 'vitest'

it('case', () => {})`,
      filename: 'src/a.kernel.test.ts',
    },
    {
      name: 'Should_Pass_When_KernelUnderTestsDirectoryImportsVitest',
      code: `import { it } from 'vitest'

it('case', () => {})`,
      filename: 'src/__tests__/a.kernel.ts',
    },
    {
      name: 'Should_Pass_When_ObserverImportsVitest',
      code: `import { step } from 'vitest'

export const observe = step`,
      filename: 'src/a.observer.ts',
    },
    {
      name: 'Should_Pass_When_UnsuffixedFileImportsVitest',
      code: `import { it } from 'vitest'

export const helper = it`,
      filename: 'src/a.ts',
    },
    {
      name: 'Should_Pass_When_KernelReexportsVitestTypeOnly',
      code: `export type { TestAPI } from 'vitest'`,
      filename: 'src/a.kernel.ts',
    },
    {
      name: 'Should_Pass_When_WorkflowImportsVitestWithEmptyPureCellsOption',
      code: `import { it } from 'vitest'

export const workflow = it`,
      filename: 'src/a.workflow.ts',
      options: [{ pureCells: [] }],
    },
    {
      name: 'Should_Pass_When_KernelImportsUnlistedRuntime',
      code: `import { fastCheck } from 'fast-check/extra'

export const tag = fastCheck`,
      filename: 'src/a.kernel.ts',
      options: [{ testRuntimes: ['vitest', '@effect/vitest'] }],
    },
  ],
  invalid: [
    {
      name: 'Should_Report_KernelImportingEffectVitestValue',
      code: `import { it } from '@effect/vitest'

export const tag = it`,
      filename: 'src/a.kernel.ts',
      errors: [{
        messageId: 'forbiddenTestRuntime',
        data: {
          name: '@effect/vitest',
          cell: '.kernel',
          expected: TEST_RUNTIME_EXPECTED,
          actual: 'a runtime import of the test runtime @effect/vitest',
          fix: TEST_RUNTIME_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_KernelImportingVitestSideEffect',
      code: `import 'vitest'

export const tag = <T>(value: T): T => value`,
      filename: 'src/a.kernel.ts',
      errors: [{
        messageId: 'forbiddenTestRuntime',
        data: {
          name: 'vitest',
          cell: '.kernel',
          expected: TEST_RUNTIME_EXPECTED,
          actual: 'a runtime import of the test runtime vitest',
          fix: TEST_RUNTIME_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_KernelImportingMixedTypeAndValueSpecifiers',
      code: `import { type TestAPI, it } from 'vitest'

export const tag = it`,
      filename: 'src/a.kernel.ts',
      errors: [{
        messageId: 'forbiddenTestRuntime',
        data: {
          name: 'vitest',
          cell: '.kernel',
          expected: TEST_RUNTIME_EXPECTED,
          actual: 'a runtime import of the test runtime vitest',
          fix: TEST_RUNTIME_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_KernelBareTopLevelDynamicImportOfVitest',
      code: `export const tag = <T>(value: T): T => value

await import('vitest')`,
      filename: 'src/a.kernel.ts',
      errors: [{
        messageId: 'forbiddenTestRuntime',
        data: {
          name: 'vitest',
          cell: '.kernel',
          expected: TEST_RUNTIME_EXPECTED,
          actual: 'a runtime import of the test runtime vitest',
          fix: TEST_RUNTIME_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_KernelDynamicImportOfVitestInGuardAlternate',
      code: `export const tag = <T>(value: T): T => value

if (import.meta.vitest) {
  tag
} else {
  await import('vitest')
}`,
      filename: 'src/a.kernel.ts',
      errors: [{
        messageId: 'forbiddenTestRuntime',
        data: {
          name: 'vitest',
          cell: '.kernel',
          expected: TEST_RUNTIME_EXPECTED,
          actual: 'a runtime import of the test runtime vitest',
          fix: TEST_RUNTIME_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_WorkflowImportingVitest',
      code: `import { it } from 'vitest'

export const workflow = it`,
      filename: 'src/a.workflow.ts',
      errors: [{
        messageId: 'forbiddenTestRuntime',
        data: {
          name: 'vitest',
          cell: '.workflow',
          expected: TEST_RUNTIME_EXPECTED,
          actual: 'a runtime import of the test runtime vitest',
          fix: TEST_RUNTIME_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_ShapeImportingFastCheckSubpath',
      code: `import { arbitrary } from 'fast-check/something'

export interface Row { readonly id: string }

export const rowArbitrary = arbitrary`,
      filename: 'src/a.shape.ts',
      errors: [{
        messageId: 'forbiddenTestRuntime',
        data: {
          name: 'fast-check/something',
          cell: '.shape',
          expected: TEST_RUNTIME_EXPECTED,
          actual: 'a runtime import of the test runtime fast-check/something',
          fix: TEST_RUNTIME_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_KernelImportingVitestConfigSubpath',
      code: `import { defineConfig } from 'vitest/config'

export const config = defineConfig({})`,
      filename: 'src/a.kernel.ts',
      errors: [{
        messageId: 'forbiddenTestRuntime',
        data: {
          name: 'vitest/config',
          cell: '.kernel',
          expected: TEST_RUNTIME_EXPECTED,
          actual: 'a runtime import of the test runtime vitest/config',
          fix: TEST_RUNTIME_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_KernelImportingFastCheckBare',
      code: `import { fastCheck } from 'fast-check'

export const tag = fastCheck`,
      filename: 'src/a.kernel.ts',
      errors: [{
        messageId: 'forbiddenTestRuntime',
        data: {
          name: 'fast-check',
          cell: '.kernel',
          expected: TEST_RUNTIME_EXPECTED,
          actual: 'a runtime import of the test runtime fast-check',
          fix: TEST_RUNTIME_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_KernelReexportingEffectVitestValue',
      code: `export { it } from '@effect/vitest'`,
      filename: 'src/a.kernel.ts',
      errors: [{
        messageId: 'forbiddenTestRuntime',
        data: {
          name: '@effect/vitest',
          cell: '.kernel',
          expected: TEST_RUNTIME_EXPECTED,
          actual: 'a runtime import of the test runtime @effect/vitest',
          fix: TEST_RUNTIME_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_ExecutorWithPureCellsOptionNamingExecutor',
      code: `import { it } from 'vitest'

export const run = it`,
      filename: 'src/a.executor.ts',
      options: [{ pureCells: ['executor'] }],
      errors: [{
        messageId: 'forbiddenTestRuntime',
        data: {
          name: 'vitest',
          cell: '.executor',
          expected: TEST_RUNTIME_EXPECTED,
          actual: 'a runtime import of the test runtime vitest',
          fix: TEST_RUNTIME_FIX,
        },
      }],
    },
  ],
})
