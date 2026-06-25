import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'
import { noInlineDestructuredType } from '../no-inline-destructured-type.js'

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

const expectedMessage = 'Named type, utility type (Pick/Omit), or destructuring in function body'
const fixMessage = 'Extract to a named type, use Pick/Omit, or destructure in function body'

const inlineTypeError = (name: string) => ({
  messageId: 'noInlineDestructuredType' as const,
  data: {
    name,
    expected: expectedMessage,
    actual: 'Inline { prop: type } annotation',
    fix: fixMessage,
  },
})

ruleTester.run('no-inline-destructured-type', noInlineDestructuredType, {
  valid: [
    {
      name: 'Should_Pass_When_UsingNamedType',
      code: `function updateProfile({ name, age }: UserProfile) {}`,
    },
    {
      name: 'Should_Pass_When_UsingPickUtilityType',
      code: `function updateProfile({ name }: Pick<User, 'name'>) {}`,
    },
    {
      name: 'Should_Pass_When_UsingOmitUtilityType',
      code: `function updateProfile({ name }: Omit<User, 'age'>) {}`,
    },
    {
      name: 'Should_Pass_When_DestructuringInBody',
      code: `function updateProfile(user: User) { const { name } = user }`,
    },
    {
      name: 'Should_Pass_When_NoTypeAnnotation',
      code: `function fn({ x }) {}`,
    },
    {
      name: 'Should_Pass_When_NonDestructuredParamWithNamedType',
      code: `function fn(x: User) {}`,
    },
    {
      name: 'Should_Pass_When_ArrowFunctionWithNamedType',
      code: `const fn = ({ data }: DataType) => data`,
    },
    {
      name: 'Should_Pass_When_MethodWithNamedType',
      code: `const obj = { method({ id }: User) {} }`,
    },
    {
      name: 'Should_Pass_When_ClassMethodWithNamedType',
      code: `class Foo { method({ id }: User) {} }`,
    },
    {
      name: 'Should_Pass_When_UtilityTypeWithAllowUtilityTypesTrue',
      code: `function fn({ id }: Pick<User, 'id'>) {}`,
      options: [{ allowUtilityTypes: true }],
    },
    {
      name: 'Should_Pass_When_ConstructorParameterProperty',
      code: `class Foo { constructor(public name: string) {} }`,
    },
    {
      name: 'Should_Pass_When_DefaultParamWithNamedType',
      code: `function fn({ id }: User = { id: '1' }) {}`,
    },
    {
      name: 'Should_Pass_When_DefaultParamWithoutTypeAnnotation',
      code: `function fn({ id } = { id: '1' }) {}`,
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_FunctionDeclarationWithInlineType',
      code: `function updateProfile({ name, age }: { name: string; age: number }) {}`,
      errors: [inlineTypeError('updateProfile')],
    },
    {
      name: 'Should_Report_When_ArrowFunctionWithInlineType',
      code: `const handler = ({ data }: { data: number[] }) => data`,
      errors: [inlineTypeError('handler')],
    },
    {
      name: 'Should_Report_When_FunctionExpressionWithInlineType',
      code: `const fn = function ({ x }: { x: Date }) {}`,
      errors: [inlineTypeError('fn')],
    },
    {
      name: 'Should_Report_When_AnonymousDefaultExportWithInlineType',
      code: `export default function ({ x }: { x: string }) {}`,
      errors: [inlineTypeError('Anonymous function')],
    },
    {
      name: 'Should_Report_When_ClassMethodWithInlineType',
      code: `class Foo { method({ x }: { x: string }) {} }`,
      errors: [inlineTypeError('method')],
    },
    {
      name: 'Should_Report_When_ObjectMethodWithInlineType',
      code: `const obj = { handler({ x }: { x: string }) {} }`,
      errors: [inlineTypeError('handler')],
    },
    {
      name: 'Should_Report_When_MultipleInlineParams',
      code: `function fn({ a }: { a: string }, { b }: { b: number }) {}`,
      errors: [inlineTypeError('fn'), inlineTypeError('fn')],
    },
    {
      name: 'Should_Report_When_SinglePropertyInlineType',
      code: `function fn({ x }: { x: Date }) {}`,
      errors: [inlineTypeError('fn')],
    },
    {
      name: 'Should_Report_When_AnonymousArrowInCallback',
      code: `[1].map(({ x }: { x: number }) => x)`,
      errors: [inlineTypeError('Anonymous function')],
    },
    {
      name: 'Should_Report_When_NonDestructuredParamWithInlineType',
      code: `function fn(x: { id: string }) {}`,
      errors: [inlineTypeError('fn')],
    },
    {
      name: 'Should_Report_When_ArrowNonDestructuredParamWithInlineType',
      code: `const fn = (x: { id: string }) => x`,
      errors: [inlineTypeError('fn')],
    },
    {
      name: 'Should_Report_When_DefaultParamWithInlineType',
      code: `function fn({ id }: { id: string } = { id: '1' }) {}`,
      errors: [inlineTypeError('fn')],
    },
    {
      name: 'Should_Report_When_UtilityTypeWithAllowUtilityTypesFalse',
      code: `function fn({ id }: Pick<User, 'id'>) {}`,
      options: [{ allowUtilityTypes: false }],
      errors: [inlineTypeError('fn')],
    },
  ],
})
