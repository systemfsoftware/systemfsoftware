import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { noWildcardReexport } from '../no-wildcard-reexport.js'

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

const wildcardReexportError = (source: string) => [
  { messageId: 'wildcardReexport' as const, data: { source } },
]

ruleTester.run('no-wildcard-reexport', noWildcardReexport, {
  valid: [
    {
      name: 'Should_Not_Report_When_ReExportIsNamespaceAliased',
      code: "export * as Ns from './inner.js'",
    },
    {
      name: 'Should_Not_Report_When_ReExportIsNamedList',
      code: "export { a, b } from './inner.js'",
    },
    {
      name: 'Should_Not_Report_When_ReExportIsAliasedNamedList',
      code: "export { a as alpha, b as beta } from './inner.js'",
    },
    {
      name: 'Should_Not_Report_When_ExportIsLocalDeclaration',
      code: 'export const value = 1',
    },
    {
      name: 'Should_Not_Report_When_ImportIsNamespaceAliased',
      code: "import * as ns from './inner.js'",
    },
    {
      name: 'Should_Not_Report_When_ImportIsDefault',
      code: "import value from './inner.js'",
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_ReExportIsBareWildcard',
      code: "export * from './inner.js'",
      errors: wildcardReexportError('./inner.js'),
    },
    {
      name: 'Should_Report_When_ReExportIsTypeOnlyWildcard',
      code: "export type * from './inner.js'",
      errors: wildcardReexportError('./inner.js'),
    },
    {
      name: 'Should_Report_EachWildcard_When_FileCarriesTwo',
      code: "export * from './a.js'\nexport * from './b.js'",
      errors: [
        ...wildcardReexportError('./a.js'),
        ...wildcardReexportError('./b.js'),
      ],
    },
    {
      name: 'Should_Report_When_WildcardIsBareAndTypeOnly_InSameFile',
      code: "export * from './a.js'\nexport type * from './b.js'",
      errors: [
        ...wildcardReexportError('./a.js'),
        ...wildcardReexportError('./b.js'),
      ],
    },
  ],
})
