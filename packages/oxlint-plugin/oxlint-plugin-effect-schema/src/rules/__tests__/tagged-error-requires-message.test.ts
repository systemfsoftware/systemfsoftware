import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { taggedErrorRequiresMessage } from '../tagged-error-requires-message.js'

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

const EXPECTED =
  'a non-empty message: an `override get message(): string` getter on the class, or a `message` field in the schema fields'
const ACTUAL = 'a class extending Schema.TaggedError that declares no message'
const FIX =
  'add `override get message(): string` deriving the text from the error fields, or declare `message: Schema.String` in the schema fields and set it where the error is constructed'

const error = (className: string) => ({
  messageId: 'missingMessage' as const,
  data: {
    name: `class ${className} extends Schema.TaggedError without a message`,
    expected: EXPECTED,
    actual: ACTUAL,
    fix: FIX,
  },
})

ruleTester.run('tagged-error-requires-message', taggedErrorRequiresMessage, {
  valid: [
    {
      name: 'Should_Pass_When_MessageGetterDeclared',
      code: `
        import { Schema } from 'effect'
        export class E extends Schema.TaggedError<E>()('E', { a: Schema.String }) {
          override get message(): string {
            return this.a
          }
        }
      `,
      filename: 'src/e.schema.ts',
    },
    {
      name: 'Should_Pass_When_MessageIsAnAliasedSchemaField',
      code: `
        import { Schema as S } from 'effect'
        export class E extends S.TaggedError<E>()('E', { a: S.String, message: S.String }) {}
      `,
      filename: 'src/e.schema.ts',
    },
    {
      name: 'Should_Pass_When_MessagePropertyDeclaredOnTheClass',
      code: `
        import * as S from 'effect/Schema'
        export class E extends S.TaggedError<E>()('E', { a: S.String }) {
          readonly message: string = \`bad input \${this.a}\`
        }
      `,
      filename: 'src/e.schema.ts',
    },
    {
      name: 'Should_Pass_When_MessageIsATypeLiteralField',
      code: `
        import { Schema } from 'effect'
        export class E extends Schema.TaggedError('E')<{ message: string }> {}
      `,
      filename: 'src/e.schema.ts',
    },
    {
      name: 'Should_Pass_When_ExtendingTaggedClass',
      code: `
        import { Schema } from 'effect'
        class C extends Schema.TaggedClass<C>()('C', { a: Schema.String }) {}
      `,
      filename: 'src/c.schema.ts',
    },
    {
      name: 'Should_Pass_When_ExtendingDataTaggedError',
      code: `
        import { Data } from 'effect'
        class E extends Data.TaggedError('E')<{ a: string }> {}
      `,
      filename: 'src/e.schema.ts',
    },
    {
      name: 'Should_Pass_When_ExtendingANonSchemaBase',
      code: `class E extends Error {}`,
      filename: 'src/e.ts',
    },
    {
      name: 'Should_Pass_When_TheClassExtendsNothing',
      code: `class E {}`,
      filename: 'src/e.ts',
    },
    {
      name: 'Should_Pass_When_MessageIsAQuotedSchemaField',
      code: `
        import { Schema } from 'effect'
        export class E extends Schema.TaggedError<E>()('E', { 'message': Schema.String }) {}
      `,
      filename: 'src/e.schema.ts',
    },
    {
      name: 'Should_Pass_When_TheFileIsUnderTestsDirectory',
      code: `
        import { Schema } from 'effect'
        export class E extends Schema.TaggedError<E>()('E', { a: Schema.String }) {}
      `,
      filename: '/repo/pkg/tests/e.schema.ts',
    },
    {
      name: 'Should_Pass_When_TheFileIsUnderNestedTestsDirectory',
      code: `
        import { Schema } from 'effect'
        export class E extends Schema.TaggedError<E>()('E', { a: Schema.String }) {}
      `,
      filename: '/repo/pkg/src/__tests__/e.ts',
    },
    {
      name: 'Should_Pass_When_TheFileIsUnderFixturesDirectory',
      code: `
        import { Schema } from 'effect'
        export class E extends Schema.TaggedError<E>()('E', { a: Schema.String }) {}
      `,
      filename: '/repo/pkg/tests/__fixtures__/e.schema.ts',
    },
    {
      name: 'Should_Pass_When_TheFileIsATestFile',
      code: `
        import { Schema } from 'effect'
        const E = class extends Schema.TaggedError<never>()('E', {}) {}
      `,
      filename: '/repo/pkg/src/e.test.ts',
    },
    {
      name: 'Should_Pass_When_TheFileIsAnIntegrationTestFile',
      code: `
        import { Schema } from 'effect'
        const E = class extends Schema.TaggedError<never>()('E', {}) {}
      `,
      filename: '/repo/pkg/tests/e.integration.test.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_NoMessageIsDeclared',
      code: `
        import { Schema } from 'effect'
        export class E extends Schema.TaggedError<E>()('E', { a: Schema.String }) {}
      `,
      filename: 'src/e.schema.ts',
      errors: [error('E')],
    },
    {
      name: 'Should_Report_When_ExtendingThroughANamespaceAliasOfEffectSchema',
      code: `
        import * as S from 'effect/Schema'
        export class E extends S.TaggedError<E>()('E', { a: S.String }) {}
      `,
      filename: 'src/e.schema.ts',
      errors: [error('E')],
    },
    {
      name: 'Should_Report_When_ExtendingThroughARenamedNamedImport',
      code: `
        import { TaggedError as TE, String as Str } from 'effect/Schema'
        export class E extends TE<E>()('E', { a: Str }) {}
      `,
      filename: 'src/e.schema.ts',
      errors: [error('E')],
    },
    {
      name: 'Should_Report_When_SchemaIsAliasedOnTheEffectRoot',
      code: `
        import { Schema as Sch } from 'effect'
        export class E extends Sch.TaggedError<E>()('E', { a: Sch.String }) {}
      `,
      filename: 'src/e.schema.ts',
      errors: [error('E')],
    },
    {
      name: 'Should_Report_When_TheClassExpressionIsNamed',
      code: `
        import { Schema } from 'effect'
        export const E = class E extends Schema.TaggedError<E>()('E', {}) {}
      `,
      filename: 'src/e.schema.ts',
      errors: [error('E')],
    },
    {
      name: 'Should_Report_When_TheClassExpressionIsAnonymous',
      code: `
        import { Schema } from 'effect'
        export const E = class extends Schema.TaggedError<never>()('E', {}) {}
      `,
      filename: 'src/e.schema.ts',
      errors: [error('<anonymous>')],
    },
    {
      name: 'Should_Report_When_AMessageMethodIsNotAGetter',
      code: `
        import { Schema } from 'effect'
        export class E extends Schema.TaggedError<E>()('E', {}) {
          message(): string {
            return 'E'
          }
        }
      `,
      filename: 'src/e.schema.ts',
      errors: [error('E')],
    },
    {
      name: 'Should_Report_When_TheSchemaFieldsCarryAnUnrelatedField',
      code: `
        import { Schema } from 'effect'
        export class E extends Schema.TaggedError<E>()('E', { 'reason': Schema.String }) {}
      `,
      filename: 'src/e.schema.ts',
      errors: [error('E')],
    },
    {
      name: 'Should_Report_EveryMessageLessClassInTheFile',
      code: `
        import { Schema } from 'effect'
        export class A extends Schema.TaggedError<A>()('A', {}) {}
        export class B extends Schema.TaggedError<B>()('B', {}) {}
      `,
      filename: 'src/e.schema.ts',
      errors: [error('A'), error('B')],
    },
    {
      name: 'Should_Report_When_TestsAppearsOnlyAsASubstringOfADirectoryName',
      code: `
        import { Schema } from 'effect'
        export class E extends Schema.TaggedError<E>()('E', {}) {}
      `,
      filename: '/repo/pkg/src/contests/e.schema.ts',
      errors: [error('E')],
    },
  ],
})
