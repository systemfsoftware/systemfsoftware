import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'
import { MISSING_TAG_ACTUAL, MISSING_TAG_EXPECTED, MISSING_TAG_FIX } from '../internal-export-jsdoc.config.js'
import { internalExportJsdoc } from '../internal-export-jsdoc.js'

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

const missing = [{
  messageId: 'missingInternalTag' as const,
  data: {
    name: 'export',
    expected: MISSING_TAG_EXPECTED,
    actual: MISSING_TAG_ACTUAL,
    fix: MISSING_TAG_FIX,
  },
}]

ruleTester.run('internal-export-jsdoc', internalExportJsdoc, {
  valid: [
    {
      name: 'Should_StaySilent_When_InternalExportHasTag',
      filename: '/repo/pkg/src/internal/a.ts',
      code: `/** @internal */\nexport const foo = 1\n`,
    },
    {
      name: 'Should_StaySilent_When_PublicFileHasNoTag',
      filename: '/repo/pkg/src/mod.ts',
      code: `export const foo = 1\n`,
    },
    {
      name: 'Should_StaySilent_When_FilenameContainsInternalButIsNotFolder',
      filename: '/repo/pkg/src/internalize.ts',
      code: `export const foo = 1\n`,
    },
    {
      name: 'Should_StaySilent_When_InternalFileHasNoExport',
      filename: '/repo/pkg/src/internal/a.ts',
      code: `const foo = 1\n`,
    },
    {
      name: 'Should_StaySilent_When_StringLiteralMentionsInternal',
      filename: '/repo/pkg/src/internal/a.ts',
      code: `/** @internal */\nexport const MESSAGE = 'the @internal surface'\n`,
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_NestedInternalExportMissingTag',
      filename: '/repo/pkg/src/feature/internal/a.ts',
      code: `export const foo = 1\n`,
      errors: missing,
    },
    {
      name: 'Should_Report_When_TypeReexportMissingTag',
      filename: '/repo/pkg/src/internal/a.ts',
      code: `export type { X } from './x.js'\n`,
      errors: missing,
    },
    {
      name: 'Should_Report_When_StarExportMissingTag',
      filename: '/repo/pkg/src/internal/a.ts',
      code: `export * from './x.js'\n`,
      errors: missing,
    },
    {
      name: 'Should_Report_When_SecondExportIsUntaggedAfterTaggedNeighbor',
      filename: '/repo/pkg/src/internal/a.ts',
      code: `/** @internal */\nexport const a = 1\nexport const b = 2\n`,
      errors: missing,
    },
    {
      name: 'Should_Report_When_DefaultExportMissingTag',
      filename: '/repo/pkg/src/internal/a.ts',
      code: `export default function a() {}\n`,
      errors: missing,
    },
    {
      name: 'Should_Report_When_InternalExportUsesCapitalizedTag',
      filename: '/repo/pkg/src/internal/a.ts',
      code: `/** @Internal */\nexport const foo = 1\n`,
      errors: missing,
    },

    {
      name: 'Should_Report_When_InternalExportStringMentionsTagButHasNone',
      filename: '/repo/pkg/src/internal/a.ts',
      code: `export const MESSAGE = 'the @internal surface'\n`,
      errors: missing,
    },
  ],
})
