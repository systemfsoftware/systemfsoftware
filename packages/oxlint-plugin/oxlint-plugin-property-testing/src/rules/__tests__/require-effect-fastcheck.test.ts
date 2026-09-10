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
      name: 'Should_Pass_When_NoFastCheckImport',
      code: `import { Schema } from 'effect'\nit.prop('∀s_X_=x', [Schema.String], ([s]) => s === s)`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_UnrelatedPackageImport',
      code: `import { describe, it } from '@effect/vitest'\nit.prop('∀n_X_=x', [Schema.String], ([n]) => n === n)`,
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
      name: 'Should_Pass_When_TypeOnlyFastCheckImportFromTesting',
      code: `import type { FastCheck } from 'effect/testing'\ntype F = typeof FastCheck`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_FastCheckAliasFromOtherPackage',
      code: `import { FastCheck as notFc } from 'some-other-lib'`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_TestClockFromEffectTesting',
      code: `import { TestClock } from 'effect/testing'\nawait TestClock.adjust('1 second')`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_OtherEffectSpecifiersUnaliased',
      code:
        `import { Effect, Schema } from 'effect'\nit.effect.prop('∀s_X_=x', [Schema.String], ([s]) => Effect.succeed(s === s))`,
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
            expected: 'no FastCheck import — pass Effect Schemas directly to it.prop',
            actual: "FastCheck imported from 'fast-check'",
            fix: 'delete the fast-check import; pass the Schema directly to it.prop([DomainSchema])',
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
      name: 'Should_Report_When_FastCheckAsFcFromEffect',
      code: `import { FastCheck as fc } from 'effect'\nit.prop('∀n_X_=x', [Schema.String], ([n]) => n === n)`,
      filename: FILENAME,
      errors: [
        {
          messageId: 'effectFastCheckImport',
          data: {
            name: "FastCheck imported from 'effect'",
            expected: 'no FastCheck import — pass Effect Schemas directly to it.prop',
            actual: "FastCheck imported from 'effect'",
            fix: 'delete the FastCheck import; pass the Schema directly to it.prop([DomainSchema])',
          },
        },
      ],
    },
    {
      name: 'Should_Report_When_FastCheckAliasedToOtherName',
      code: `import { FastCheck as fastCheck } from 'effect'\nit.prop('∀n_X_=x', [Schema.String], ([n]) => n === n)`,
      filename: FILENAME,
      errors: [{ messageId: 'effectFastCheckImport' }],
    },
    {
      name: 'Should_Report_When_FastCheckImportedUnaliased',
      code: `import { FastCheck } from 'effect'\nit.prop('∀n_X_=x', [Schema.String], ([n]) => n === n)`,
      filename: FILENAME,
      errors: [{ messageId: 'effectFastCheckImport' }],
    },
    {
      name: 'Should_Report_When_FastCheckFromEffectTesting',
      code: `import { FastCheck as fc } from 'effect/testing'\nit.prop('∀n_X_=x', [Schema.String], ([n]) => n === n)`,
      filename: FILENAME,
      errors: [{ messageId: 'effectFastCheckImport' }],
    },
  ],
})
