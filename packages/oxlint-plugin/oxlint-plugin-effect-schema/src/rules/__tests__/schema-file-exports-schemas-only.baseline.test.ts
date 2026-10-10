import { createRuleTester } from './_tester.js'

import {
  NON_SCHEMA_EXPORT_ACTUAL,
  NON_SCHEMA_EXPORT_EXPECTED,
  NON_SCHEMA_EXPORT_FIX,
} from '../schema-file-exports-schemas-only.config.js'
import { schemaFileExportsSchemasOnly } from '../schema-file-exports-schemas-only.js'

const ruleTester = createRuleTester()

const nonSchemaError = (name: string) => ({
  messageId: 'nonSchemaExport',
  data: {
    name,
    expected: NON_SCHEMA_EXPORT_EXPECTED,
    actual: NON_SCHEMA_EXPORT_ACTUAL,
    fix: NON_SCHEMA_EXPORT_FIX,
  },
})

ruleTester.run('schema-file-exports-schemas-only', schemaFileExportsSchemasOnly, {
  valid: [
    {
      name: 'Should_Pass_When_ASchemaLocalIsDefaultExported',
      code: `import { Schema as S } from 'effect'
const Local = S.Struct({ n: S.Number })
export default Local`,
      filename: '/repo/pkg/src/domain.schema.ts',
    },
    {
      name: 'Should_Pass_When_AnOperationAnnotationNamesASchemaLocal',
      code: `import { Schema as S } from 'effect'
const Local = S.Struct({ n: S.Number })
export const op = (x: Local): Local => x`,
      filename: '/repo/pkg/src/domain.schema.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_NonSchema_When_AFunctionTypeAnnotationNamesOnlyForeignTypes',
      code: `import { Schema as S } from 'effect'
export const op: (self: string) => number = S.decodeUnknownOption(S.String)`,
      filename: '/repo/pkg/src/domain.schema.ts',
      errors: [nonSchemaError('op')],
    },
    {
      name: 'Should_Report_NonSchema_When_AValueNamespaceIsReexportedByLocalName',
      code: `declare namespace OnlyTypes { interface Shape { readonly line: number } }
declare namespace HoldsValue { const x: number }
export { OnlyTypes, HoldsValue }`,
      filename: '/repo/pkg/src/domain.schema.ts',
      errors: [nonSchemaError('HoldsValue')],
    },
  ],
})
