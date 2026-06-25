import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'
import { banEffectSchemaImports } from '../ban-@-effect-schema-imports.js'

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

ruleTester.run('ban-effect-schema-imports', banEffectSchemaImports, {
  valid: [
    {
      name: 'Should_Pass_When_ImportingSchemaFromEffect',
      code: `import { Schema } from 'effect'`,
    },
    {
      name: 'Should_Pass_When_ImportingAliasedSchemaFromEffect',
      code: `import { Schema as S } from 'effect'`,
    },
    {
      name: 'Should_Pass_When_ImportingMultipleFromEffect',
      code: `import { Schema, Effect, Context } from 'effect'`,
    },
    {
      name: 'Should_Pass_When_UsingNamespaceImportFromEffect',
      code: `import * as Effect from 'effect'`,
    },
    {
      name: 'Should_Pass_When_ImportingFromOtherPackages',
      code: `
        import { something } from 'other-package'
        import { z } from 'zod'
      `,
    },
    {
      name: 'Should_Pass_When_SourceHasDifferentCasing',
      code: `import { Schema } from '@Effect/Schema'`,
    },
  ],
  invalid: [
    {
      name: 'Should_ReportAndFix_When_ImportingSchemaFromBannedSource',
      code: `import { Schema } from '@effect/schema'`,
      output: `import { Schema as S } from 'effect'`,
      errors: [{
        messageId: 'bannedImport',
        data: {
          expected: "'effect' with Schema as S",
          actual: "'@effect/schema'",
          fix: "Replace import source with 'effect' and add 'as S' alias",
        },
      }],
    },
    {
      name: 'Should_ReportAndFix_When_ImportingSchemaWithAliasFromBannedSource',
      code: `import { Schema as MySchema } from '@effect/schema'`,
      output: `import { Schema as S } from 'effect'`,
      errors: [{
        messageId: 'bannedImport',
        data: {
          expected: "'effect' with Schema as S",
          actual: "'@effect/schema'",
          fix: "Replace import source with 'effect' and add 'as S' alias",
        },
      }],
    },
    {
      name: 'Should_ReportAndFix_When_UsingNamespaceImportFromBannedSource',
      code: `import * as Schema from '@effect/schema'`,
      output: `import * as Schema from 'effect'`,
      errors: [{ messageId: 'bannedImport' }],
    },
    {
      name: 'Should_ReportAndFix_When_UsingDefaultImportFromBannedSource',
      code: `import Schema from '@effect/schema'`,
      output: `import Schema from 'effect'`,
      errors: [{ messageId: 'bannedImport' }],
    },
    {
      name: 'Should_ReportAndFix_When_ImportingFromBannedSubpath',
      code: `import { Schema } from '@effect/schema/Schema'`,
      output: `import { Schema as S } from 'effect'`,
      errors: [{ messageId: 'bannedImport' }],
    },
    {
      name: 'Should_ReportAndFix_When_ImportingMultipleFromBannedSource',
      code: `import { Schema, Effect } from '@effect/schema'`,
      output: `import { Schema as S, Effect } from 'effect'`,
      errors: [{ messageId: 'bannedImport' }],
    },
    {
      name: 'Should_ReportAndFix_When_ImportingOtherSpecifiersFromBannedSource',
      code: `import { Array, Effect } from '@effect/schema'`,
      output: `import { Array, Effect } from 'effect'`,
      errors: [{ messageId: 'bannedImport' }],
    },
    {
      name: 'Should_ReportAndFix_When_BannedImportWithOtherImports',
      code: `
        import { Schema } from '@effect/schema'
        import { something } from 'other-package'
      `,
      output: `
        import { Schema as S } from 'effect'
        import { something } from 'other-package'
      `,
      errors: [{ messageId: 'bannedImport' }],
    },
  ],
})
