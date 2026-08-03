import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import {
  BEHAVIOUR_EXPECTED,
  BEHAVIOUR_FIX,
  DEFAULT_FUNCTION_EXPORT_ACTUAL,
  FUNCTION_CONST_ACTUAL,
  FUNCTION_DECLARATION_ACTUAL,
  METHOD_DEFINITION_ACTUAL,
} from '../shape-no-behaviour.config.js'
import { shapeNoBehaviour } from '../shape-no-behaviour.js'

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

ruleTester.run('shape-no-behaviour', shapeNoBehaviour, {
  valid: [
    {
      name: 'Should_Pass_When_DeclaringInterfaceWithMethodSignatures',
      code: `export interface Stat {
  isFile(): boolean
  isDirectory(): boolean
  readonly mode: number
  readonly size: number
}`,
      filename: 'memory-file-system.shape.ts',
    },
    {
      name: 'Should_Pass_When_DeclaringForeignConstructorConst',
      code: `import { integer, pgTable } from 'drizzle-orm/pg-core'

export const scans = pgTable('scans', {
  id: integer('id'),
})`,
      filename: 'scans.shape.ts',
    },
    {
      name: 'Should_Pass_When_DeclaringTypeAliasAndEnum',
      code: `export type Row = { readonly id: string }

export enum Status {
  Active = 'active',
  Done = 'done',
}`,
      filename: 'order.shape.ts',
    },
    {
      name: 'Should_Pass_When_DeclaringSchemaConst',
      code: `import { Schema as S } from 'effect'

export const OrderRow = S.Struct({ id: S.String })`,
      filename: 'order.shape.ts',
    },
    {
      name: 'Should_Pass_When_DeclaringConstWithObjectLiteral',
      code: `export const HTTP_CODES = { ok: 200 } as const`,
      filename: 'order.shape.ts',
    },
    {
      name: 'Should_Pass_When_DeclaringUninitializedLet',
      code: `let scratch: unknown`,
      filename: 'order.shape.ts',
    },
    {
      name: 'Should_Pass_When_DeclaringClassWithFieldsOnly',
      code: `export class Row {
  readonly id!: string
  readonly version!: number
}`,
      filename: 'order.shape.ts',
    },
    {
      name: 'Should_Pass_When_DeclaringInterfaceWithCallSignature',
      code: `export interface RowMapper {
  (row: unknown): unknown
}`,
      filename: 'order.shape.ts',
    },
    {
      name: 'Should_Pass_When_WorkflowFileDeclaresFunction',
      code: `export function compute(x: number): number { return x + 1 }`,
      filename: 'process-claim.workflow.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_FunctionDeclaration_When_ShapeFile',
      code: `export function scanRowToDomain(row: unknown): unknown { return row }`,
      filename: 'scans.shape.ts',
      errors: [{
        messageId: 'functionDeclaration',
        data: {
          name: 'scanRowToDomain',
          expected: BEHAVIOUR_EXPECTED,
          actual: FUNCTION_DECLARATION_ACTUAL,
          fix: BEHAVIOUR_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_FunctionDeclaration_When_AnonymousDefaultFunction',
      code: `export default function () { return 1 }`,
      filename: 'order.shape.ts',
      errors: [{
        messageId: 'functionDeclaration',
        data: {
          name: '<anonymous>',
          expected: BEHAVIOUR_EXPECTED,
          actual: FUNCTION_DECLARATION_ACTUAL,
          fix: BEHAVIOUR_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_FunctionConst_When_ArrowFunctionConst',
      code: `export const scanRowToDomain = (row: unknown): unknown => row`,
      filename: 'scans.shape.ts',
      errors: [{
        messageId: 'functionConst',
        data: {
          name: 'scanRowToDomain',
          expected: BEHAVIOUR_EXPECTED,
          actual: FUNCTION_CONST_ACTUAL,
          fix: BEHAVIOUR_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_FunctionConst_When_FunctionExpressionConst',
      code: `export const scanRowToDomain = function (row: unknown): unknown { return row }`,
      filename: 'scans.shape.ts',
      errors: [{
        messageId: 'functionConst',
        data: {
          name: 'scanRowToDomain',
          expected: BEHAVIOUR_EXPECTED,
          actual: FUNCTION_CONST_ACTUAL,
          fix: BEHAVIOUR_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_FunctionConst_When_DestructuredBinding',
      code: `const [fn] = () => undefined`,
      filename: 'order.shape.ts',
      errors: [{
        messageId: 'functionConst',
        data: {
          name: '<pattern>',
          expected: BEHAVIOUR_EXPECTED,
          actual: FUNCTION_CONST_ACTUAL,
          fix: BEHAVIOUR_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_MethodDefinition_When_ClassMethod',
      code: `export class Row {
  isFile(): boolean { return true }
}`,
      filename: 'order.shape.ts',
      errors: [{
        messageId: 'methodDefinition',
        data: {
          name: 'isFile',
          expected: BEHAVIOUR_EXPECTED,
          actual: METHOD_DEFINITION_ACTUAL,
          fix: BEHAVIOUR_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_MethodDefinition_When_Constructor',
      code: `export class Row {
  constructor(readonly id: string) {}
}`,
      filename: 'order.shape.ts',
      errors: [{
        messageId: 'methodDefinition',
        data: {
          name: 'constructor',
          expected: BEHAVIOUR_EXPECTED,
          actual: METHOD_DEFINITION_ACTUAL,
          fix: BEHAVIOUR_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_MethodDefinition_When_LiteralComputedKey',
      code: `export class Row {
  ['isFile'](): boolean { return true }
}`,
      filename: 'order.shape.ts',
      errors: [{
        messageId: 'methodDefinition',
        data: {
          name: 'isFile',
          expected: BEHAVIOUR_EXPECTED,
          actual: METHOD_DEFINITION_ACTUAL,
          fix: BEHAVIOUR_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_MethodDefinition_When_ExpressionComputedKey',
      code: `export class Row {
  ['is' + 'File'](): boolean { return true }
}`,
      filename: 'order.shape.ts',
      errors: [{
        messageId: 'methodDefinition',
        data: {
          name: '<computed>',
          expected: BEHAVIOUR_EXPECTED,
          actual: METHOD_DEFINITION_ACTUAL,
          fix: BEHAVIOUR_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_DefaultFunctionExport_When_ArrowDefaultExport',
      code: `export default () => 1`,
      filename: 'order.shape.ts',
      errors: [{
        messageId: 'defaultFunctionExport',
        data: {
          name: '<default export>',
          expected: BEHAVIOUR_EXPECTED,
          actual: DEFAULT_FUNCTION_EXPORT_ACTUAL,
          fix: BEHAVIOUR_FIX,
        },
      }],
    },
  ],
})
