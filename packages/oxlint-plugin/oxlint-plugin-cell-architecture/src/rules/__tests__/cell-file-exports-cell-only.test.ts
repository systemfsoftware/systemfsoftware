import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import {
  DEFAULT_EXPORT_ACTUAL,
  EXPECTED,
  FIX,
  REEXPORT_ACTUAL_TEMPLATE,
  REEXPORT_EXPECTED,
  REEXPORT_FIX,
  VALUE_EXPORT_ACTUAL_OF,
} from '../cell-file-exports-cell-only.config.js'
import { cellFileExportsCellOnly } from '../cell-file-exports-cell-only.js'

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

const CELL_FILENAME = '/repo/packages/effect-cell-types/src/supervisor-step.cell.ts'

const valueExportError = (name: string, actual: string) => ({
  messageId: 'cellValueExport' as const,
  data: { name: `the value export \`${name}\``, expected: EXPECTED, actual, fix: FIX },
})

ruleTester.run('cell-file-exports-cell-only', cellFileExportsCellOnly, {
  valid: [
    {
      name: 'Should_Pass_When_TheCellIsTheOnlyValueExportWithInterfacesBeside',
      code: `export interface Steps { readonly name: string }
export interface SweepOptions { readonly size: number }
export interface CellOptions extends Steps { readonly options: SweepOptions }
export const supervisorStepFor = (runtime: number): number => runtime`,
      filename: CELL_FILENAME,
    },
    {
      name: 'Should_Pass_When_TheOnlyOtherExportsAreATypeAliasAndATypeOnlySpecifier',
      code: `interface Thing { readonly x: number }
interface Other { readonly y: number }
export type { Thing }
export { type Other }
export const supervisorStepFor = (runtime: number): number => runtime`,
      filename: CELL_FILENAME,
    },
    {
      name: 'Should_Pass_When_TheTypeVocabularyLeavesThroughAnExportSpecifier',
      code: `interface Widget { readonly x: number }
export { Widget }
export const supervisorStepFor = (runtime: number): number => runtime`,
      filename: CELL_FILENAME,
    },
    {
      name: 'Should_Pass_When_AReExportIsTypeOnly',
      code: `export type { Thing } from './thing.js'
export const supervisorStepFor = (runtime: number): number => runtime`,
      filename: CELL_FILENAME,
    },
    {
      name: 'Should_Pass_When_AnExportedAmbientNamespaceCarriesOnlyTypes',
      code: `export declare namespace Meta { type Id = string }
export const supervisorStepFor = (runtime: number): number => runtime`,
      filename: CELL_FILENAME,
    },
    {
      name: 'Should_Not_Judge_ABareCellFileWithoutTheRoleSuffix',
      code: `export const first = 1
export const second = 2
export default first`,
      filename: '/repo/packages/shop/src/cell.ts',
    },
    {
      name: 'Should_Not_Judge_AFileWhoseNameMerelyEndsInCell',
      code: `export const first = 1
export const second = 2`,
      filename: '/repo/packages/shop/src/mycell.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_ASecondValueExportLeavesTheCellFile',
      code: `import { Cell } from '@systemfsoftware/effect-cell-types'
export const supervisorStepFor = (runtime: number): number => runtime
export const Steps = { run: supervisorStepFor }`,
      filename: CELL_FILENAME,
      errors: [valueExportError('Steps', VALUE_EXPORT_ACTUAL_OF('Steps'))],
    },
    {
      name: 'Should_Report_When_ASchemaDeclarationSitsBesideTheCell',
      code: `import * as Schema from 'effect/Schema'
export const supervisorStepFor = (runtime: number): number => runtime
export const Steps = Schema.Struct({ name: Schema.String })`,
      filename: CELL_FILENAME,
      errors: [valueExportError('Steps', VALUE_EXPORT_ACTUAL_OF('Steps'))],
    },
    {
      name: 'Should_Report_When_AValueLeavesThroughANamedReExport',
      code: `export const supervisorStepFor = (runtime: number): number => runtime
export { runtimeOf } from './runtime.js'`,
      filename: CELL_FILENAME,
      errors: [{
        messageId: 'cellReexport' as const,
        data: {
          name: 'a re-export',
          expected: REEXPORT_EXPECTED,
          actual: REEXPORT_ACTUAL_TEMPLATE.replace('{{source}}', './runtime.js'),
          fix: REEXPORT_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_When_AStarReExportLeavesTheCellFile',
      code: `export * from './runtime.js'`,
      filename: CELL_FILENAME,
      errors: [{
        messageId: 'cellReexport' as const,
        data: {
          name: 'a re-export',
          expected: REEXPORT_EXPECTED,
          actual: REEXPORT_ACTUAL_TEMPLATE.replace('{{source}}', './runtime.js'),
          fix: REEXPORT_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_When_AValueLeavesThroughAnExportSpecifier',
      code: `const supervisorStepFor = (runtime: number): number => runtime
export { supervisorStepFor }
const Steps = { run: supervisorStepFor }
export { Steps }`,
      filename: CELL_FILENAME,
      errors: [valueExportError('Steps', VALUE_EXPORT_ACTUAL_OF('Steps'))],
    },
    {
      name: 'Should_Report_When_ADefaultExportAccompaniesTheCell',
      code: `export const supervisorStepFor = (runtime: number): number => runtime
export default supervisorStepFor`,
      filename: CELL_FILENAME,
      errors: [{
        messageId: 'cellValueExport' as const,
        data: { name: 'the default export', expected: EXPECTED, actual: DEFAULT_EXPORT_ACTUAL, fix: FIX },
      }],
    },
    {
      name: 'Should_Report_When_EveryValueAfterTheFirstLeavesTheCellFile',
      code: `export const first = 1
export const second = 2
export const third = 3`,
      filename: CELL_FILENAME,
      errors: [
        valueExportError('second', VALUE_EXPORT_ACTUAL_OF('second')),
        valueExportError('third', VALUE_EXPORT_ACTUAL_OF('third')),
      ],
    },
    {
      name: 'Should_Report_When_AnEnumAccompaniesTheCell',
      code: `export enum Step { One, Two }
export const supervisorStepFor = (runtime: number): number => runtime`,
      filename: CELL_FILENAME,
      errors: [valueExportError('supervisorStepFor', VALUE_EXPORT_ACTUAL_OF('supervisorStepFor'))],
    },
  ],
})
