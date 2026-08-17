import { createRuleTester } from './_tester.js'

import { schemaDeclarationLocation } from '../schema-declaration-location.js'

const ruleTester = createRuleTester()

const EXPECTED =
  'schema declarations only in *.schema.ts (any stem, several per file) or in the owning <stem>.workflow.ts'
const ACTUAL = 'a schema declared in a file that is neither *.schema.ts nor a single-segment <stem>.workflow.ts'
const FIX =
  'move it to <stem>.schema.ts or into the *.workflow.ts that owns it and import it; a schema only a test uses belongs in tests/__fixtures__/<stem>.schema.ts'

const error = (name: string) => ({
  messageId: 'schemaOutsideSchemaFile',
  data: { name, expected: EXPECTED, actual: ACTUAL, fix: FIX },
})

ruleTester.run('schema-declaration-location', schemaDeclarationLocation, {
  valid: [
    {
      name: 'Should_Pass_When_ClassAndConstSchemasLiveInASchemaFile',
      code: `import { Schema } from 'effect'
export class E extends Schema.TaggedError<E>()('E', { message: Schema.String }) {}
export const U = Schema.Union([Schema.String, Schema.Number])`,
      filename: '/repo/pkg/src/domain.schema.ts',
    },
    {
      name: 'Should_Pass_When_SchemasLiveInTheOwningWorkflowFile',
      code: `import { Schema } from 'effect'
export const DecideInput = Schema.Struct({ n: Schema.Number })`,
      filename: '/repo/pkg/src/decide.workflow.ts',
    },
    {
      name: 'Should_Pass_When_SchemaIsBlockScopedInsideAnInSourceVitestBlock',
      code: `import { Schema } from 'effect'
if (import.meta.vitest) {
  const TagError = Schema.TaggedStruct('T', { code: Schema.Number })
}`,
      filename: '/repo/pkg/src/helper.kernel.ts',
    },
    {
      name: 'Should_Pass_When_DecodeCallHasNoModuleScopeBinding',
      code: `import { Schema } from 'effect'
export function decode(input: unknown) {
  const x = Schema.Struct({ a: Schema.String })
  return Schema.decodeUnknownResult(x)(input)
}`,
      filename: '/repo/pkg/src/decoder.ts',
    },
    {
      name: 'Should_Pass_When_ConstIsASchemaUseNotADeclaration',
      code: `import { Schema as S } from 'effect'
export const asToolInput = S.decodeUnknownOption(S.Record(S.String, S.Unknown))`,
      filename: '/repo/pkg/src/hook-payload.kernel.ts',
    },
    {
      name: 'Should_Pass_When_AliasedSchemaImportLivesInASchemaFile',
      code: `import { Schema as S } from 'effect'
export const U = S.Union([S.String, S.Number])`,
      filename: '/repo/pkg/src/domain.schema.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_ClassSchemaLivesInAKernelFile',
      code: `import { Schema } from 'effect'
export class StepError extends Schema.TaggedError<StepError>()('StepError', { message: Schema.String }) {}`,
      filename: '/repo/pkg/src/step-error.kernel.ts',
      errors: [error('StepError')],
    },
    {
      name: 'Should_Report_When_ConstSchemaLivesInATypesFile',
      code: `import { Schema } from 'effect'
export const U = Schema.Union([Schema.String, Schema.Number])`,
      filename: '/repo/pkg/src/types.ts',
      errors: [error('U')],
    },
    {
      name: 'Should_Report_When_AliasedConstSchemaLivesInATypesFile',
      code: `import { Schema as S } from 'effect'
export const U = S.Union([S.String, S.Number])`,
      filename: '/repo/pkg/src/types.ts',
      errors: [error('U')],
    },
    {
      name: 'Should_Report_When_ClassSchemaLivesInAWorkflowFileWithAnExtraPeriod',
      code: `import { Schema } from 'effect'
export class E extends Schema.TaggedError<E>()('E', { message: Schema.String }) {}`,
      filename: '/repo/pkg/src/foo.bar.workflow.ts',
      errors: [error('E')],
    },
  ],
})
