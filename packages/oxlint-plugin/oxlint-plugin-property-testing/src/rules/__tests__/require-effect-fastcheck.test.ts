import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { requireEffectFastcheck } from '../require-effect-fastcheck.js'

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

const FILENAME = 'src/sort.property.test.ts'

ruleTester.run('require-effect-fastcheck', requireEffectFastcheck, {
  valid: [
    {
      name: 'Should_Pass_When_FastCheckAsFcFromEffect',
      code: `import { FastCheck as fc } from 'effect'\nit.prop('∀n_X_=x', [fc.integer()], ([n]) => n === n)`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_FastCheckAsFcAmongOtherEffectImports',
      code:
        `import { Effect, FastCheck as fc, Schema } from 'effect'\nit.effect.prop('∀x_X_=x', [fc.integer()], ([n]) => Effect.gen(function*() { return n === n }))`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_NoFastCheckImport',
      code: `import { Schema } from 'effect'\nit.prop('∀s_X_=x', [Schema.String], ([s]) => s === s)`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_UnrelatedPackageImport',
      code: `import { describe, it } from '@effect/vitest'\nit.prop('∀n_X_=x', [fc.integer()], ([n]) => n === n)`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_TypeOnlyFastCheckImport',
      code:
        `import { type FastCheck, Schema as S } from 'effect'\nconst arb = () => (fc: typeof FastCheck) => fc.string()`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_WholeDeclarationTypeImport',
      code: `import type { FastCheck } from 'effect'\ntype F = typeof FastCheck`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_FastCheckAliasFromOtherPackage',
      code: `import { FastCheck as notFc } from 'some-other-lib'`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_OtherEffectSpecifiersUnaliased',
      code:
        `import { Arbitrary, Schema } from 'effect'\nit.prop('∀s_X_=x', [Arbitrary.make(Schema.String)], ([s]) => s === s)`,
      filename: FILENAME,
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_DefaultImportFromFastCheck',
      code: `import fc from 'fast-check'\nit.prop('∀n_X_=x', [fc.integer()], ([n]) => n === n)`,
      filename: FILENAME,
      errors: [
        {
          messageId: 'rawFastCheckImport',
          data: {
            name: "import from 'fast-check'",
            expected: "import { FastCheck as fc } from 'effect'",
            actual: "FastCheck imported from 'fast-check'",
            fix: "delete the 'fast-check' import; add FastCheck as fc to the existing 'effect' import",
          },
        },
      ],
    },
    {
      name: 'Should_Report_When_NamespaceImportFromFastCheck',
      code: `import * as fc from 'fast-check'\nit.prop('∀n_X_=x', [fc.integer()], ([n]) => n === n)`,
      filename: FILENAME,
      errors: [{ messageId: 'rawFastCheckImport' }],
    },
    {
      name: 'Should_Report_When_NamedImportFromFastCheck',
      code: `import { integer, string } from 'fast-check'\nit.prop('∀n_X_=x', [integer()], ([n]) => n === n)`,
      filename: FILENAME,
      errors: [{ messageId: 'rawFastCheckImport' }],
    },
    {
      name: 'Should_Report_When_SubpathImportFromFastCheck',
      code: `import { Arbitrary } from 'fast-check/lib/arbitrary'`,
      filename: FILENAME,
      errors: [{ messageId: 'rawFastCheckImport' }],
    },
    {
      name: 'Should_Report_When_FastCheckAliasedToOtherName',
      code:
        `import { FastCheck as fastCheck } from 'effect'\nit.prop('∀n_X_=x', [fastCheck.integer()], ([n]) => n === n)`,
      filename: FILENAME,
      errors: [
        {
          messageId: 'fastCheckAlias',
          data: {
            name: "FastCheck imported as 'fastCheck'",
            expected: "import { FastCheck as fc } from 'effect'",
            actual: "aliased to 'fastCheck'",
            fix: 'rename the alias to fc — every rule and reader assumes the `fc` namespace',
          },
        },
      ],
    },
    {
      name: 'Should_Report_When_FastCheckImportedUnaliased',
      code: `import { FastCheck } from 'effect'\nit.prop('∀n_X_=x', [FastCheck.integer()], ([n]) => n === n)`,
      filename: FILENAME,
      errors: [{ messageId: 'fastCheckAlias' }],
    },
  ],
})
