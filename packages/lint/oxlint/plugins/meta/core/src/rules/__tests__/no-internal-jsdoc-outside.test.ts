import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'
import { OUTSIDE_TAG_ACTUAL, OUTSIDE_TAG_EXPECTED, OUTSIDE_TAG_FIX } from '../no-internal-jsdoc-outside.config.js'
import { noInternalJsdocOutside } from '../no-internal-jsdoc-outside.js'

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

const tagged = [{
  messageId: 'internalTagOutsideFolder' as const,
  data: {
    name: 'export',
    expected: OUTSIDE_TAG_EXPECTED,
    actual: OUTSIDE_TAG_ACTUAL,
    fix: OUTSIDE_TAG_FIX,
  },
}]

ruleTester.run('no-internal-jsdoc-outside', noInternalJsdocOutside, {
  valid: [
    {
      name: 'Should_StaySilent_When_InternalFolderKeepsTag',
      filename: '/repo/pkg/src/internal/a.ts',
      code: `/** @internal */\nexport const foo = 1\n`,
    },
    {
      name: 'Should_StaySilent_When_PublicExportHasNoTag',
      filename: '/repo/pkg/src/mod.ts',
      code: `export const foo = 1\n`,
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_CapitalizedTagIsOutsideInternal',
      filename: '/repo/pkg/src/mod.ts',
      code: `/** @Internal */\nexport const foo = 1\n`,
      errors: tagged,
    },
    {
      name: 'Should_Report_When_PublicReexportCarriesTag',
      filename: '/repo/pkg/src/mod.ts',
      code: `/** @internal */\nexport { publicName } from './public.js'\n`,
      errors: tagged,
    },
    {
      name: 'Should_ReportOnlyTaggedExport_When_UntaggedNeighborFollows',
      filename: '/repo/pkg/src/mod.ts',
      code: `/** @internal */\nexport const a = 1\nexport const b = 2\n`,
      errors: tagged,
    },
  ],
})
