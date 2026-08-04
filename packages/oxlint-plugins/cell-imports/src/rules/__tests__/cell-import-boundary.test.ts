import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import {
  CELL_EXPECTED,
  CELL_FIX,
  OBSERVER_EXPECTED,
  OBSERVER_FIX,
  RUNTIME_EXPECTED,
  RUNTIME_FIX,
  VALUE_EXPECTED,
  VALUE_FIX,
} from '../cell-import-boundary.config.js'
import { cellImportBoundary } from '../cell-import-boundary.js'

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

ruleTester.run('cell-import-boundary', cellImportBoundary, {
  valid: [
    {
      name: 'Should_Pass_When_WorkflowImportsLocalHelperWithNoForbiddenCell',
      code: `import { helper } from './local-helper.js'

export const workflow = helper`,
      filename: 'src/thing.workflow.ts',
    },
    {
      name: 'Should_Pass_When_ExecutorImportsWorkflowCell',
      code: `import { decide } from './order.workflow.js'

export const run = decide`,
      filename: 'src/order.executor.ts',
    },
    {
      name: 'Should_Pass_When_KernelImportsLocalHelperWithNoForbiddenCell',
      code: `export const tag = <T>(value: T): T => value`,
      filename: 'src/tag.kernel.ts',
    },
    {
      name: 'Should_Pass_When_StoreImportsShapeCell',
      code: `import type { Row } from './order.shape.js'

export const find = (): Row | null => null`,
      filename: 'src/order.store.ts',
    },
    {
      name: 'Should_Pass_When_HandlerImportsLocalHelperWithNoForbiddenCell',
      code: `export const handler = (): null => null`,
      filename: 'src/route.handler.ts',
    },
    {
      name: 'Should_Pass_When_MiddlewareImportsShapeCell',
      code: `import type { Shape } from './order.shape.js'

export const guard = (_shape: Shape): boolean => true`,
      filename: 'src/order.middleware.ts',
    },
    {
      name: 'Should_Pass_When_AdapterImportsKernelCell',
      code: `import type { Tag } from './tag.kernel.js'

export const build = (_tag: Tag): null => null`,
      filename: 'src/order.adapter.ts',
    },
    {
      name: 'Should_Pass_When_PolicyImportsLocalHelperWithNoForbiddenCell',
      code: `export const rate = (): null => null`,
      filename: 'src/rate.policy.ts',
    },
    {
      name: 'Should_Pass_When_ShapeImportsLocalHelperWithNoForbiddenCell',
      code: `export interface Row { readonly id: string }`,
      filename: 'src/order.shape.ts',
    },
    {
      name: 'Should_Pass_When_StateImportsWorkflowCell',
      code: `import { decide } from './order.workflow.js'

export const decideAndLock = decide`,
      filename: 'src/order.state.ts',
    },
    {
      name: 'Should_Pass_When_ObserverImportsKernelCell',
      code: `import { tag } from './tag.kernel.js'

export const probe = tag`,
      filename: 'src/order.observer.ts',
    },
    {
      name: 'Should_Pass_When_IntegrationTestImportsLocalHelper',
      code: `import { helper } from './local-helper.js'

export const test = helper`,
      filename: 'src/order.integration.test.ts',
    },
    {
      name: 'Should_Pass_When_StateImportsAdapterAsTypeOnly',
      code: `import type { Adapter } from './x.adapter.js'

export const state = (a: Adapter): null => null`,
      filename: 'src/x.state.ts',
    },
    {
      name: 'Should_Pass_When_ExecutorImportsAdapterAsTypeOnly',
      code: `import type { Adapter } from './x.adapter.js'

export const run = (a: Adapter): null => null`,
      filename: 'src/x.executor.ts',
    },
    {
      name: 'Should_Pass_When_ExecutorImportsExecutorViaInternalSegment',
      code: `import { run } from './internal/y.executor.js'

export const compose = run`,
      filename: 'src/x.executor.ts',
    },
    {
      name: 'Should_Pass_When_WorkflowImportsNonRuntimePackage',
      code: `import * as effect from 'effect'

export const w = effect`,
      filename: 'src/x.workflow.ts',
    },
    {
      name: 'Should_Pass_When_KernelImportsNonRuntimePackage',
      code: `import * as effect from 'effect'

export const k = effect`,
      filename: 'src/x.kernel.ts',
    },
    {
      name: 'Should_Pass_When_HandlerImportsNonRuntimePackage',
      code: `import * as effect from 'effect'

export const h = effect`,
      filename: 'src/x.handler.ts',
    },
    {
      name: 'Should_Pass_When_TestImportsObserverModule',
      code: `import { probe } from './probe.observer.js'

export const t = probe`,
      filename: 'src/x.test.ts',
    },
    {
      name: 'Should_Pass_When_ObserverImportsObserverModule',
      code: `import { probe } from './probe.observer.js'

export const o = probe`,
      filename: 'src/a.observer.ts',
    },
    {
      name: 'Should_Pass_When_ScriptImportsObserverModule',
      code: `import { probe } from './probe.observer.js'

export const tool = probe`,
      filename: 'scripts/tool.ts',
    },
    {
      name: 'Should_Pass_When_PlainProductionFileHasNoRelevantImports',
      code: `import { helper } from './local-helper.js'

export const value = helper`,
      filename: 'src/plain.ts',
    },
    {
      name: 'Should_Pass_When_SpecifierHasNoCellSuffix_BareEffectPackage',
      code: `import * as effect from 'effect'

export const x = effect`,
      filename: 'src/x.workflow.ts',
    },
    {
      name: 'Should_Pass_When_SpecifierHasNoCellSuffix_ScopedPackage',
      code: `import * as pkg from '@scope/pkg'

export const x = pkg`,
      filename: 'src/x.kernel.ts',
    },
    {
      name: 'Should_Pass_When_ExecutorImportsExecutorViaBareInternalSegment',
      code: `import { run } from 'internal/y.executor.js'

export const compose = run`,
      filename: 'src/x.executor.ts',
    },
    {
      name: 'Should_Pass_When_ExecutorInsideInternalDirectoryImportsRelativeExecutor',
      code: `import { run } from './y.executor.js'

export const compose = run`,
      filename: 'src/internal/x.executor.ts',
    },
    {
      name: 'Should_Pass_When_ExecutorImportsExecutorViaParentInternalSegment',
      code: `import { run } from '../internal/y.executor.js'

export const compose = run`,
      filename: 'src/x.executor.ts',
    },
    {
      name: 'Should_Pass_When_ExecutorImportsExecutorViaGrandparentInternalSegment',
      code: `import { run } from '../../internal/y.executor.js'

export const compose = run`,
      filename: 'src/deep/x.executor.ts',
    },
    {
      name: 'Should_Pass_When_ExecutorImportsExecutorBeyondRootInternalSegment',
      code: `import { run } from '../../../internal/y.executor.js'

export const compose = run`,
      filename: 'src/x.executor.ts',
    },
    {
      name: 'Should_Pass_When_ExecutorImportsExecutorViaEmptySegments',
      code: `import { run } from './internal//y.executor.js'

export const compose = run`,
      filename: 'src/x.executor.ts',
    },
    {
      name: 'Should_Pass_When_ExecutorImportsExecutorViaInternalSegmentWithTrailingSlash',
      code: `import { run } from './internal/y.executor.js/'

export const compose = run`,
      filename: 'src/x.executor.ts',
    },
    {
      name: 'Should_Pass_When_WorkflowImportsDotStoreCell',
      code: `import { x } from './.store.js'

export const w = x`,
      filename: 'src/x.workflow.ts',
    },
    {
      name: 'Should_Pass_When_StateImportsAdapterWithInlineTypeSpecifier',
      code: `import { type Adapter } from './x.adapter.js'

export const state = (a: Adapter): null => null`,
      filename: 'src/x.state.ts',
    },
    {
      name: 'Should_Pass_When_StateReExportsAdapterCellAsNamedType',
      code: `export type { Adapter } from './x.adapter.js'`,
      filename: 'src/x.state.ts',
    },
    {
      name: 'Should_Pass_When_StateReExportsAdapterCellAsType',
      code: `export type * from './x.adapter.js'`,
      filename: 'src/x.state.ts',
    },
    {
      name: 'Should_Pass_When_ExecutorDynamicallyImportsWorkflowCell',
      code: `export const load = () => import('./order.workflow.js')`,
      filename: 'src/x.executor.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_ExecutorImportingShapeThroughInternalSegment',
      code: `import { Row } from './internal/y.shape.js'

export const use = Row`,
      filename: 'src/x.executor.ts',
      errors: [{ messageId: 'forbiddenCellImport' }],
    },
    {
      name: 'Should_Report_WorkflowImportingStoreCell',
      code: `import { find } from './order.store.js'

export const w = find`,
      filename: 'src/thing.workflow.ts',
      errors: [{
        messageId: 'forbiddenCellImport',
        data: {
          name: './order.store.js',
          expected: CELL_EXPECTED,
          actual: 'an import of the .store cell',
          fix: CELL_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_ExecutorImportingShapeCell',
      code: `import type { Shape } from './order.shape.js'

export const run = (_shape: Shape): null => null`,
      filename: 'src/order.executor.ts',
      errors: [{
        messageId: 'forbiddenCellImport',
        data: {
          name: './order.shape.js',
          expected: CELL_EXPECTED,
          actual: 'an import of the .shape cell',
          fix: CELL_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_KernelImportingSchemaCell',
      code: `import { Schema } from './order.schema.js'

export const k = Schema`,
      filename: 'src/tag.kernel.ts',
      errors: [{
        messageId: 'forbiddenCellImport',
        data: {
          name: './order.schema.js',
          expected: CELL_EXPECTED,
          actual: 'an import of the .schema cell',
          fix: CELL_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_StoreImportingStoreCell',
      code: `import { find } from './order.store.js'

export const compose = find`,
      filename: 'src/order.store.ts',
      errors: [{
        messageId: 'forbiddenCellImport',
        data: {
          name: './order.store.js',
          expected: CELL_EXPECTED,
          actual: 'an import of the .store cell',
          fix: CELL_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_HandlerImportingStoreCell',
      code: `import { find } from './order.store.js'

export const h = find`,
      filename: 'src/route.handler.ts',
      errors: [{
        messageId: 'forbiddenCellImport',
        data: {
          name: './order.store.js',
          expected: CELL_EXPECTED,
          actual: 'an import of the .store cell',
          fix: CELL_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_MiddlewareImportingExecutorCell',
      code: `import { run } from './order.executor.js'

export const m = run`,
      filename: 'src/order.middleware.ts',
      errors: [{
        messageId: 'forbiddenCellImport',
        data: {
          name: './order.executor.js',
          expected: CELL_EXPECTED,
          actual: 'an import of the .executor cell',
          fix: CELL_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_AdapterImportingWorkflowCell',
      code: `import { decide } from './order.workflow.js'

export const a = decide`,
      filename: 'src/order.adapter.ts',
      errors: [{
        messageId: 'forbiddenCellImport',
        data: {
          name: './order.workflow.js',
          expected: CELL_EXPECTED,
          actual: 'an import of the .workflow cell',
          fix: CELL_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_PolicyImportingSchemaCell',
      code: `import { Schema } from './order.schema.js'

export const p = Schema`,
      filename: 'src/rate.policy.ts',
      errors: [{
        messageId: 'forbiddenCellImport',
        data: {
          name: './order.schema.js',
          expected: CELL_EXPECTED,
          actual: 'an import of the .schema cell',
          fix: CELL_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_ShapeImportingSchemaCell',
      code: `import { Schema } from './order.schema.js'

export const s = Schema`,
      filename: 'src/order.shape.ts',
      errors: [{
        messageId: 'forbiddenCellImport',
        data: {
          name: './order.schema.js',
          expected: CELL_EXPECTED,
          actual: 'an import of the .schema cell',
          fix: CELL_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_StateImportingAdapterAsValue',
      code: `import { build } from './x.adapter.js'

export const s = build`,
      filename: 'src/x.state.ts',
      errors: [{
        messageId: 'forbiddenValueImport',
        data: {
          name: './x.adapter.js',
          expected: VALUE_EXPECTED,
          actual: 'a value import of the .adapter cell',
          fix: VALUE_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_ObserverImportingSchemaCell',
      code: `import { Schema } from './order.schema.js'

export const o = Schema`,
      filename: 'src/order.observer.ts',
      errors: [{
        messageId: 'forbiddenCellImport',
        data: {
          name: './order.schema.js',
          expected: CELL_EXPECTED,
          actual: 'an import of the .schema cell',
          fix: CELL_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_IntegrationTestImportingKernelCell',
      code: `import { tag } from './tag.kernel.js'

export const t = tag`,
      filename: 'src/order.integration.test.ts',
      errors: [{
        messageId: 'forbiddenCellImport',
        data: {
          name: './tag.kernel.js',
          expected: CELL_EXPECTED,
          actual: 'an import of the .kernel cell',
          fix: CELL_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_ExecutorImportingAdapterAsValue',
      code: `import { build } from './x.adapter.js'

export const run = build`,
      filename: 'src/x.executor.ts',
      errors: [{
        messageId: 'forbiddenValueImport',
        data: {
          name: './x.adapter.js',
          expected: VALUE_EXPECTED,
          actual: 'a value import of the .adapter cell',
          fix: VALUE_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_ExecutorImportingExecutorWithoutInternalSegment',
      code: `import { run } from './y.executor.js'

export const compose = run`,
      filename: 'src/x.executor.ts',
      errors: [{
        messageId: 'forbiddenCellImport',
        data: {
          name: './y.executor.js',
          expected: CELL_EXPECTED,
          actual: 'an import of the .executor cell',
          fix: CELL_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_WorkflowImportingNodeFs',
      code: `import * as fs from 'node:fs'

export const w = fs`,
      filename: 'src/x.workflow.ts',
      errors: [{
        messageId: 'forbiddenRuntimeImport',
        data: {
          name: 'node:fs',
          expected: RUNTIME_EXPECTED,
          actual: 'a direct import of a node runtime module',
          fix: RUNTIME_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_WorkflowImportingBarePath',
      code: `import * as path from 'path'

export const w = path`,
      filename: 'src/x.workflow.ts',
      errors: [{
        messageId: 'forbiddenRuntimeImport',
        data: {
          name: 'path',
          expected: RUNTIME_EXPECTED,
          actual: 'a direct import of a node runtime module',
          fix: RUNTIME_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_KernelImportingNodeFs',
      code: `import * as fs from 'node:fs'

export const k = fs`,
      filename: 'src/x.kernel.ts',
      errors: [{
        messageId: 'forbiddenRuntimeImport',
        data: {
          name: 'node:fs',
          expected: RUNTIME_EXPECTED,
          actual: 'a direct import of a node runtime module',
          fix: RUNTIME_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_KernelImportingBarePath',
      code: `import * as path from 'path'

export const k = path`,
      filename: 'src/x.kernel.ts',
      errors: [{
        messageId: 'forbiddenRuntimeImport',
        data: {
          name: 'path',
          expected: RUNTIME_EXPECTED,
          actual: 'a direct import of a node runtime module',
          fix: RUNTIME_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_HandlerImportingNodeFs',
      code: `import * as fs from 'node:fs'

export const h = fs`,
      filename: 'src/x.handler.ts',
      errors: [{
        messageId: 'forbiddenRuntimeImport',
        data: {
          name: 'node:fs',
          expected: RUNTIME_EXPECTED,
          actual: 'a direct import of a node runtime module',
          fix: RUNTIME_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_HandlerImportingBarePath',
      code: `import * as path from 'path'

export const h = path`,
      filename: 'src/x.handler.ts',
      errors: [{
        messageId: 'forbiddenRuntimeImport',
        data: {
          name: 'path',
          expected: RUNTIME_EXPECTED,
          actual: 'a direct import of a node runtime module',
          fix: RUNTIME_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_ProductionFileImportingObserverModule',
      code: `import { probe } from './probe.observer.js'

export const run = probe`,
      filename: 'src/thing.executor.ts',
      errors: [{
        messageId: 'forbiddenObserverImport',
        data: {
          name: './probe.observer.js',
          expected: OBSERVER_EXPECTED,
          actual: 'a production module reaching into the observer frame',
          fix: OBSERVER_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_WorkflowReExportingStoreCell',
      code: `export * from './x.store.js'`,
      filename: 'src/x.workflow.ts',
      errors: [{
        messageId: 'forbiddenCellImport',
        data: {
          name: './x.store.js',
          expected: CELL_EXPECTED,
          actual: 'an import of the .store cell',
          fix: CELL_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_When_ExecutorInsideInternalDirectoryImportsBareExecutor',
      code: `import { run } from 'y.executor.js'

export const compose = run`,
      filename: 'src/internal/x.executor.ts',
      errors: [{
        messageId: 'forbiddenCellImport',
        data: {
          name: 'y.executor.js',
          expected: CELL_EXPECTED,
          actual: 'an import of the .executor cell',
          fix: CELL_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_When_ExecutorInsideInternalDirectoryImportsParentExecutor',
      code: `import { run } from '../y.executor.js'

export const compose = run`,
      filename: 'src/internal/x.executor.ts',
      errors: [{
        messageId: 'forbiddenCellImport',
        data: {
          name: '../y.executor.js',
          expected: CELL_EXPECTED,
          actual: 'an import of the .executor cell',
          fix: CELL_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_When_ExecutorImportsExecutorViaCancelledInternalSegment',
      code: `import { run } from './internal/../y.executor.js'

export const compose = run`,
      filename: 'src/x.executor.ts',
      errors: [{
        messageId: 'forbiddenCellImport',
        data: {
          name: './internal/../y.executor.js',
          expected: CELL_EXPECTED,
          actual: 'an import of the .executor cell',
          fix: CELL_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_When_WorkflowImportsStoreCellWithTrailingSlash',
      code: `import { find } from './x.store.js/'

export const w = find`,
      filename: 'src/x.workflow.ts',
      errors: [{
        messageId: 'forbiddenCellImport',
        data: {
          name: './x.store.js/',
          expected: CELL_EXPECTED,
          actual: 'an import of the .store cell',
          fix: CELL_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_When_StateSideEffectImportsAdapterCell',
      code: `import './x.adapter.js'`,
      filename: 'src/x.state.ts',
      errors: [{
        messageId: 'forbiddenValueImport',
        data: {
          name: './x.adapter.js',
          expected: VALUE_EXPECTED,
          actual: 'a value import of the .adapter cell',
          fix: VALUE_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_When_StateImportsAdapterWithMixedBindings',
      code: `import { build, type Shape } from './x.adapter.js'

export const s = build`,
      filename: 'src/x.state.ts',
      errors: [{
        messageId: 'forbiddenValueImport',
        data: {
          name: './x.adapter.js',
          expected: VALUE_EXPECTED,
          actual: 'a value import of the .adapter cell',
          fix: VALUE_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_When_StateReExportsAdapterCellNamed',
      code: `export { build } from './x.adapter.js'`,
      filename: 'src/x.state.ts',
      errors: [{
        messageId: 'forbiddenValueImport',
        data: {
          name: './x.adapter.js',
          expected: VALUE_EXPECTED,
          actual: 'a value import of the .adapter cell',
          fix: VALUE_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_When_StateReExportsAdapterCell',
      code: `export * from './x.adapter.js'`,
      filename: 'src/x.state.ts',
      errors: [{
        messageId: 'forbiddenValueImport',
        data: {
          name: './x.adapter.js',
          expected: VALUE_EXPECTED,
          actual: 'a value import of the .adapter cell',
          fix: VALUE_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_When_WorkflowDynamicallyImportsStoreCell',
      code: `export const load = () => import('./x.store.js')`,
      filename: 'src/x.workflow.ts',
      errors: [{
        messageId: 'forbiddenCellImport',
        data: {
          name: './x.store.js',
          expected: CELL_EXPECTED,
          actual: 'an import of the .store cell',
          fix: CELL_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_When_StateDynamicallyImportsAdapterCell',
      code: `export const load = () => import('./x.adapter.js')`,
      filename: 'src/x.state.ts',
      errors: [{
        messageId: 'forbiddenValueImport',
        data: {
          name: './x.adapter.js',
          expected: VALUE_EXPECTED,
          actual: 'a value import of the .adapter cell',
          fix: VALUE_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_When_PlainProductionFileImportsObserverModule',
      code: `import { probe } from './probe.observer.js'

export const run = probe`,
      filename: 'src/plain.ts',
      errors: [{
        messageId: 'forbiddenObserverImport',
        data: {
          name: './probe.observer.js',
          expected: OBSERVER_EXPECTED,
          actual: 'a production module reaching into the observer frame',
          fix: OBSERVER_FIX,
        },
      }],
    },
  ],
})
