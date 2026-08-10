import { ACTUAL, EXPECTED, FIX } from '../type-no-runtime-export.config.js'
import { typeNoRuntimeExport } from '../type-no-runtime-export.js'
import { createRuleTester } from './_tester.js'

const ruleTester = createRuleTester()

const runtimeValueExport = (name: string) => [{
  messageId: 'runtimeValueExport',
  data: {
    name,
    expected: EXPECTED,
    actual: ACTUAL,
    fix: FIX,
  },
}]

ruleTester.run('type-no-runtime-export', typeNoRuntimeExport, {
  valid: [
    {
      name: 'Should_Allow_TypeAlias_When_TypeCell',
      code: 'export type X = string',
      filename: '/repo/pkg/src/a.type.ts',
    },
    {
      name: 'Should_Allow_Interface_When_TypeCell',
      code: 'export interface X {}',
      filename: '/repo/pkg/src/a.type.ts',
    },
    {
      name: 'Should_Allow_AmbientConst_When_TypeCell',
      code: 'export declare const x: number',
      filename: '/repo/pkg/src/a.type.ts',
    },
    {
      name: 'Should_Allow_AmbientClass_When_TypeCell',
      code: 'export declare class X {}',
      filename: '/repo/pkg/src/a.type.ts',
    },
    {
      name: 'Should_Allow_AmbientEnum_When_TypeCell',
      code: 'export declare enum X {}',
      filename: '/repo/pkg/src/a.type.ts',
    },
    {
      name: 'Should_Allow_AmbientFunction_When_TypeCell',
      code: 'export declare function f(): void',
      filename: '/repo/pkg/src/a.type.ts',
    },
    {
      name: 'Should_Allow_TypeOnlyReExport_When_TypeCell',
      code: "export type { Y } from './y.js'",
      filename: '/repo/pkg/src/a.type.ts',
    },
    {
      name: 'Should_Allow_TypeOnlyStarReExport_When_TypeCell',
      code: "export type * from './y.js'",
      filename: '/repo/pkg/src/a.type.ts',
    },
    {
      name: 'Should_Allow_InlineTypeSpecifierReExport_When_TypeCell',
      code: "export { type Y } from './y.js'",
      filename: '/repo/pkg/src/a.type.ts',
    },
    {
      name: 'Should_Allow_TypeOnlyLocalReExport_When_TypeCell',
      code: 'export type { Y }',
      filename: '/repo/pkg/src/a.type.ts',
    },
    {
      name: 'Should_Allow_DefaultInterface_When_TypeCell',
      code: 'export default interface X {}',
      filename: '/repo/pkg/src/a.type.ts',
    },
    {
      name: 'Should_Allow_RuntimeExports_When_SchemaCell',
      code: `
        export const x = 1
        export class X {}
        export enum E {}
        export function f() {}
      `,
      filename: '/repo/pkg/src/a.schema.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_Const_When_TypeCell',
      code: 'export const x = 1',
      filename: '/repo/pkg/src/a.type.ts',
      errors: runtimeValueExport('x'),
    },
    {
      name: 'Should_Report_MultipleConsts_When_TypeCell',
      code: 'export const a = 1, b = 2',
      filename: '/repo/pkg/src/a.type.ts',
      errors: runtimeValueExport('a').concat(runtimeValueExport('b')),
    },
    {
      name: 'Should_Report_DestructuredConst_When_TypeCell',
      code: 'export const { a, b: c } = obj',
      filename: '/repo/pkg/src/a.type.ts',
      errors: runtimeValueExport('a').concat(runtimeValueExport('c')),
    },
    {
      name: 'Should_Report_Class_When_TypeCell',
      code: 'export class X {}',
      filename: '/repo/pkg/src/a.type.ts',
      errors: runtimeValueExport('X'),
    },
    {
      name: 'Should_Report_Enum_When_TypeCell',
      code: 'export enum X {}',
      filename: '/repo/pkg/src/a.type.ts',
      errors: runtimeValueExport('X'),
    },
    {
      name: 'Should_Report_Function_When_TypeCell',
      code: 'export function f() {}',
      filename: '/repo/pkg/src/a.type.ts',
      errors: runtimeValueExport('f'),
    },
    {
      name: 'Should_Report_ValueReExport_When_TypeCell',
      code: "export { Y } from './y.js'",
      filename: '/repo/pkg/src/a.type.ts',
      errors: runtimeValueExport('Y'),
    },
    {
      name: 'Should_Report_OnlyValueSpecifier_When_MixedReExportInTypeCell',
      code: "export { type Y, z } from './y.js'",
      filename: '/repo/pkg/src/a.type.ts',
      errors: runtimeValueExport('z'),
    },
    {
      name: 'Should_Report_StarReExport_When_TypeCell',
      code: "export * from './y.js'",
      filename: '/repo/pkg/src/a.type.ts',
      errors: runtimeValueExport('./y.js'),
    },
    {
      name: 'Should_Report_DefaultClass_When_TypeCell',
      code: 'export default class X {}',
      filename: '/repo/pkg/src/a.type.ts',
      errors: runtimeValueExport('X'),
    },
    {
      name: 'Should_Report_DefaultFunction_When_TypeCell',
      code: 'export default function f() {}',
      filename: '/repo/pkg/src/a.type.ts',
      errors: runtimeValueExport('f'),
    },
  ],
})
