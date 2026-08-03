import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { schemaExportsOnlySchemas } from '../schema-exports-only-schemas.js'

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

const expected = 'a *.schema.ts file to export only schemas and type declarations'

const error = (name: string, actual: string, fix: string) => ({
  messageId: 'nonSchemaExport' as const,
  data: { name, expected, actual, fix },
})

ruleTester.run('schema-exports-only-schemas', schemaExportsOnlySchemas, {
  valid: [
    {
      name: 'Should_Ignore_When_FileIsNotASchemaFile',
      code: `export const FOO = 42`,
      filename: 'src/helpers.ts',
    },
    {
      name: 'Should_Pass_When_ExportingS_Struct',
      code: `export const Foo = S.Struct({ name: S.String })`,
      filename: 'src/foo.schema.ts',
    },
    {
      name: 'Should_Pass_When_ExportingSchema_Struct',
      code: `import { Schema } from 'effect'\nexport const Foo = Schema.Struct({ name: Schema.String })`,
      filename: 'src/foo.schema.ts',
    },
    {
      name: 'Should_Pass_When_ExportingS_StringPipe',
      code: `export const Foo = S.String.pipe(S.pattern(/^.+$/))`,
      filename: 'src/foo.schema.ts',
    },
    {
      name: 'Should_Pass_When_ExportingStructCallThenPipe',
      code:
        `import { Schema } from 'effect'\nexport const Foo = Schema.Record({ key: Schema.String, value: Schema.Array(Schema.String) }).pipe(Schema.brand('Foo'))`,
      filename: 'src/foo.schema.ts',
    },
    {
      name: 'Should_Pass_When_ExportingStructCallThenPipeWithFilterAndAnnotations',
      code:
        `import { Schema } from 'effect'\nexport const Foo = Schema.Struct({ a: Schema.Int }).pipe(Schema.filter((s) => s.a > 0), Schema.annotations({ arbitrary: () => (fc) => fc.integer() }))`,
      filename: 'src/foo.schema.ts',
    },
    {
      name: 'Should_Pass_When_ExportingNestedMemberChainCall',
      code: `import { Schema } from 'effect'\nexport const Foo = Schema.Number.annotations({ title: 'Foo' })`,
      filename: 'src/foo.schema.ts',
    },
    {
      name: 'Should_Pass_When_ExportingPipeChain',
      code: `export const Foo = pipe(S.String, S.pattern(/^.+$/), S.brand('Foo'))`,
      filename: 'src/foo.schema.ts',
    },
    {
      name: 'Should_Pass_When_ExportingS_Transform',
      code: `export const Foo = S.transform(S.String, S.Number, { decode: Number, encode: String })`,
      filename: 'src/foo.schema.ts',
    },
    {
      name: 'Should_Pass_When_ExportingS_Compose',
      code: `export const Foo = S.compose(A, B)`,
      filename: 'src/foo.schema.ts',
    },
    {
      name: 'Should_Pass_When_ExportingS_Suspend',
      code: `export const Foo: S.Schema<Foo> = S.suspend(() => S.Struct({ next: Foo }))`,
      filename: 'src/foo.schema.ts',
    },
    {
      name: 'Should_Pass_When_ExportingS_TemplateLiteral',
      code: `export const Foo = S.TemplateLiteral('0x', S.String)`,
      filename: 'src/foo.schema.ts',
    },
    {
      name: 'Should_Pass_When_ExportingSchema_Union',
      code: `import { Schema } from 'effect'\nexport const Foo = Schema.Union(A, B)`,
      filename: 'src/foo.schema.ts',
    },
    {
      name: 'Should_Pass_When_ExportingSchema_Literal',
      code: `import { Schema } from 'effect'\nexport const Foo = Schema.Literal('a', 'b')`,
      filename: 'src/foo.schema.ts',
    },
    {
      name: 'Should_Pass_When_ExportingClassExtendingSTaggedClass',
      code: `
        import { Schema as S } from 'effect'
        export class Foo extends S.TaggedClass<Foo>()('Foo', { value: S.Number }) {}
      `,
      filename: 'src/foo.schema.ts',
    },
    {
      name: 'Should_Pass_When_ExportingClassExtendingSchemaTaggedError',
      code: `
        import { Schema } from 'effect'
        export class Foo extends Schema.TaggedError<Foo>()('Foo', { message: Schema.String }) {}
      `,
      filename: 'src/foo.schema.ts',
    },
    {
      name: 'Should_Pass_When_ExportingClassExtendingSchemaClass',
      code: `
        import { Schema } from 'effect'
        export class Foo extends Schema.Class<Foo>('Foo')({ value: Schema.Number }) {}
      `,
      filename: 'src/foo.schema.ts',
    },
    {
      name: 'Should_Pass_When_ExportingCurriedSchemaClassAsVariable',
      code: `
        import { Schema } from 'effect'
        export const Foo = Schema.Class<Foo>('Foo')({ value: Schema.Number })
      `,
      filename: 'src/foo.schema.ts',
    },
    {
      name: 'Should_Pass_When_ExportingTypeAlias',
      code: `export type Foo = string`,
      filename: 'src/foo.schema.ts',
    },
    {
      name: 'Should_Pass_When_ExportingInterface',
      code: `export interface Foo { value: string }`,
      filename: 'src/foo.schema.ts',
    },
    {
      name: 'Should_Pass_When_ExportingCurriedSchemaTaggedClass',
      code: `
        import { Schema as S } from 'effect'
        export class Foo extends S.TaggedClass<Foo>()('Foo') {}
      `,
      filename: 'src/foo.schema.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_ExportingNumberConstant',
      code: `export const FOO = 42`,
      filename: 'src/foo.schema.ts',
      errors: [
        error(
          'export const FOO',
          'a value that is not a schema expression',
          'define it with S.* or Schema.* from effect, or move it to a non-schema cell',
        ),
      ],
    },
    {
      name: 'Should_Report_When_ExportingStringConstant',
      code: `export const FOO = 'bar'`,
      filename: 'src/foo.schema.ts',
      errors: [
        error(
          'export const FOO',
          'a value that is not a schema expression',
          'define it with S.* or Schema.* from effect, or move it to a non-schema cell',
        ),
      ],
    },
    {
      name: 'Should_Report_When_ExportingObjectLiteral',
      code: `export const FOO = { bar: 1 }`,
      filename: 'src/foo.schema.ts',
      errors: [
        error(
          'export const FOO',
          'a value that is not a schema expression',
          'define it with S.* or Schema.* from effect, or move it to a non-schema cell',
        ),
      ],
    },
    {
      name: 'Should_Report_When_ExportingArrayLiteral',
      code: `export const FOO = [1, 2, 3]`,
      filename: 'src/foo.schema.ts',
      errors: [
        error(
          'export const FOO',
          'a value that is not a schema expression',
          'define it with S.* or Schema.* from effect, or move it to a non-schema cell',
        ),
      ],
    },
    {
      name: 'Should_Report_When_ExportingFunction',
      code: `export function foo() { return 1 }`,
      filename: 'src/foo.schema.ts',
      errors: [error('export function', 'a function export', 'move the function to a non-schema cell')],
    },
    {
      name: 'Should_Report_When_ExportingArrowFunction',
      code: `export const foo = () => 1`,
      filename: 'src/foo.schema.ts',
      errors: [
        error(
          'export const foo',
          'a value that is not a schema expression',
          'define it with S.* or Schema.* from effect, or move it to a non-schema cell',
        ),
      ],
    },
    {
      name: 'Should_Report_When_ExportingRegularClass',
      code: `export class Foo { value = 1 }`,
      filename: 'src/foo.schema.ts',
      errors: [
        error(
          'export class',
          'a class that does not extend a Schema constructor',
          'extend S.TaggedClass, S.TaggedError, or Schema.Class, or move the class to a non-schema cell',
        ),
      ],
    },
    {
      name: 'Should_Report_When_ExportingClassExtendingSchemaStruct',
      code: `
        import { Schema } from 'effect'
        export class Foo extends Schema.Struct({ value: Schema.Number }) {}
      `,
      filename: 'src/foo.schema.ts',
      errors: [
        error(
          'export class',
          'a class that does not extend a Schema constructor',
          'extend S.TaggedClass, S.TaggedError, or Schema.Class, or move the class to a non-schema cell',
        ),
      ],
    },
    {
      name: 'Should_Report_When_ExportingEnum',
      code: `export enum Foo { A, B }`,
      filename: 'src/foo.schema.ts',
      errors: [error('export enum', 'an enum export', 'replace it with S.Literal or move it to a non-schema cell')],
    },
    {
      name: 'Should_Report_When_ExportingDefault',
      code: `export default S.String`,
      filename: 'src/foo.schema.ts',
      errors: [error('export default <anonymous>', 'a default export', 'use named schema exports instead')],
    },
    {
      name: 'Should_Report_When_ExportingDefaultIdentifier',
      code: `const Foo = S.String\nexport default Foo`,
      filename: 'src/foo.schema.ts',
      errors: [error('export default Foo', 'a default export', 'use named schema exports instead')],
    },
    {
      name: 'Should_Report_When_ReExportingNamedSpecifier',
      code: `const foo = 1\nexport { foo }`,
      filename: 'src/foo.schema.ts',
      errors: [
        error(
          'export { foo }',
          'a re-export that cannot be verified as a schema',
          'move the value to a non-schema cell or keep the schema inline',
        ),
      ],
    },
    {
      name: 'Should_Report_When_ReExportingAliasedSpecifier',
      code: `const foo = 1\nexport { foo as bar }`,
      filename: 'src/foo.schema.ts',
      errors: [
        error(
          'export { foo as bar }',
          'a re-export that cannot be verified as a schema',
          'move the value to a non-schema cell or keep the schema inline',
        ),
      ],
    },
    {
      name: 'Should_Report_When_WildcardReExporting',
      code: `export * from './other.schema.js'`,
      filename: 'src/foo.schema.ts',
      errors: [
        error(
          "export * from './other.schema.js'",
          'a wildcard re-export',
          're-export only the schemas you need, or move non-schema exports out of the target file',
        ),
      ],
    },
    {
      name: 'Should_Report_When_PipeStartsWithNonSchema',
      code: `export const Foo = pipe('not a schema', S.brand('Foo'))`,
      filename: 'src/foo.schema.ts',
      errors: [
        error(
          'export const Foo',
          'a value that is not a schema expression',
          'define it with S.* or Schema.* from effect, or move it to a non-schema cell',
        ),
      ],
    },
    {
      name: 'Should_Report_When_PipeHasNoSchemaArguments',
      code: `export const Foo = pipe(notSchemaFn())`,
      filename: 'src/foo.schema.ts',
      errors: [
        error(
          'export const Foo',
          'a value that is not a schema expression',
          'define it with S.* or Schema.* from effect, or move it to a non-schema cell',
        ),
      ],
    },
    {
      name: 'Should_Report_When_NonPipeIdentifierCallHasSchemaArgument',
      code: `export const Foo = notPipe(S.String)`,
      filename: 'src/foo.schema.ts',
      errors: [
        error(
          'export const Foo',
          'a value that is not a schema expression',
          'define it with S.* or Schema.* from effect, or move it to a non-schema cell',
        ),
      ],
    },
    {
      name: 'Should_Report_When_ExportingImportEqualsDeclaration',
      code: `export import Foo = Bar`,
      filename: 'src/foo.schema.ts',
      errors: [error('export declaration', 'an unsupported export kind', 'move it to a non-schema cell')],
    },
    {
      name: 'Should_Report_When_PipeIsEmpty',
      code: `export const Foo = pipe()`,
      filename: 'src/foo.schema.ts',
      errors: [
        error(
          'export const Foo',
          'a value that is not a schema expression',
          'define it with S.* or Schema.* from effect, or move it to a non-schema cell',
        ),
      ],
    },
    {
      name: 'Should_Report_When_ExportingIdentifierWithNoSchemaEvidence',
      code: `import { foo } from './foo.js'\nexport const Bar = foo`,
      filename: 'src/foo.schema.ts',
      errors: [
        error(
          'export const Bar',
          'a value that is not a schema expression',
          'define it with S.* or Schema.* from effect, or move it to a non-schema cell',
        ),
      ],
    },
    {
      name: 'Should_Report_When_ExportingCallToNonSchemaIdentifier',
      code: `export const Foo = notSchemaFn()`,
      filename: 'src/foo.schema.ts',
      errors: [
        error(
          'export const Foo',
          'a value that is not a schema expression',
          'define it with S.* or Schema.* from effect, or move it to a non-schema cell',
        ),
      ],
    },
    {
      name: 'Should_Report_When_ExportingCallToNonSchemaIdentifierWithSchemaArg',
      code: `export const Foo = notSchemaFn(S.String)`,
      filename: 'src/foo.schema.ts',
      errors: [
        error(
          'export const Foo',
          'a value that is not a schema expression',
          'define it with S.* or Schema.* from effect, or move it to a non-schema cell',
        ),
      ],
    },
    {
      name: 'Should_Report_When_ExportingDestructuredVariable',
      code: `export const { foo } = { foo: 1 }`,
      filename: 'src/foo.schema.ts',
      errors: [
        error(
          'export const <unknown>',
          'a value that is not a schema expression',
          'define it with S.* or Schema.* from effect, or move it to a non-schema cell',
        ),
      ],
    },
    {
      name: 'Should_Report_When_ReExportingStringLiteralExportedSpecifier',
      code: `const foo = 1\nexport { foo as 'bar' }`,
      filename: 'src/foo.schema.ts',
      errors: [
        error(
          "export { foo as 'bar' }",
          'a re-export that cannot be verified as a schema',
          'move the value to a non-schema cell or keep the schema inline',
        ),
      ],
    },

    {
      name: 'Should_Report_When_ExportingMemberExpressionWithNonSchemaRoot',
      code: `export const Foo = notS.Struct({})`,
      filename: 'src/foo.schema.ts',
      errors: [
        error(
          'export const Foo',
          'a value that is not a schema expression',
          'define it with S.* or Schema.* from effect, or move it to a non-schema cell',
        ),
      ],
    },
    {
      name: 'Should_Report_When_ExportingVariableWithNoInitializer',
      code: `export let Foo`,
      filename: 'src/foo.schema.ts',
      errors: [
        error(
          'export const Foo',
          'a value that is not a schema expression',
          'define it with S.* or Schema.* from effect, or move it to a non-schema cell',
        ),
      ],
    },
    {
      name: 'Should_Report_When_ExportingClassExtendingNonSchemaCall',
      code: `
        const Base = () => class {}
        export class Foo extends Base() {}
      `,
      filename: 'src/foo.schema.ts',
      errors: [
        error(
          'export class',
          'a class that does not extend a Schema constructor',
          'extend S.TaggedClass, S.TaggedError, or Schema.Class, or move the class to a non-schema cell',
        ),
      ],
    },
    {
      name: 'Should_Report_MultipleViolationsInOneFile',
      code: `
        export const FOO = 1
        export function bar() {}
        export class Baz {}
      `,
      filename: 'src/foo.schema.ts',
      errors: [
        error(
          'export const FOO',
          'a value that is not a schema expression',
          'define it with S.* or Schema.* from effect, or move it to a non-schema cell',
        ),
        error('export function', 'a function export', 'move the function to a non-schema cell'),
        error(
          'export class',
          'a class that does not extend a Schema constructor',
          'extend S.TaggedClass, S.TaggedError, or Schema.Class, or move the class to a non-schema cell',
        ),
      ],
    },
  ],
})
