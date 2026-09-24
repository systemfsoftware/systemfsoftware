import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import {
  ACTUAL,
  EXPECTED,
  FIX,
  STOCK_ACTUAL,
  STOCK_EXPECTED,
  STOCK_FIX,
  STOCK_NAME,
  VIOLATION_NAME,
} from '../prop-arbitrary-schema-origin.config.js'
import { propArbitrarySchemaOrigin } from '../prop-arbitrary-schema-origin.js'

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

const FILENAME = 'src/DaemonPolicy.schema.ts'

const EXPECTED_DATA = { name: VIOLATION_NAME, expected: EXPECTED, actual: ACTUAL, fix: FIX }
const STOCK_DATA = { name: STOCK_NAME, expected: STOCK_EXPECTED, actual: STOCK_ACTUAL, fix: STOCK_FIX }

const GUARD = 'if (import.meta.vitest !== void 0) {'
const GUARD_BARE = 'if (import.meta.vitest) {'
const GUARD_END = '}'

ruleTester.run('prop-arbitrary-schema-origin', propArbitrarySchemaOrigin, {
  valid: [
    {
      name: 'Should_StaySilent_When_ArbitraryIsASchemaReference',
      code: `import { Schema } from 'effect'
${GUARD}
it.prop('p', { of: [Schema.String], subject: (s) => s, runs: 100 }, (s, [v]) => v === v)
${GUARD_END}`,
      filename: FILENAME,
    },
    {
      name: 'Should_StaySilent_When_SchemaImportIsAliased',
      code: `import { Schema as S } from 'effect'
${GUARD_BARE}
it.prop('p', { of: [S.String], subject: (s) => s, runs: 100 }, (s, [v]) => v === v)
${GUARD_END}`,
      filename: FILENAME,
    },
    {
      name: 'Should_StaySilent_When_SchemaComesFromARelativeSchemaModule',
      code: `import { UserSchema } from './User.schema.js'
${GUARD}
it.prop('p', { of: [UserSchema], subject: (u) => u, runs: 100 }, (s, [v]) => v !== null)
${GUARD_END}`,
      filename: FILENAME,
    },
    {
      name: 'Should_StaySilent_When_RelativeSchemaArbitraryFeedsAFastCheckCombinator',
      code: `import { UserArb } from './User.schema.js'
import * as fc from 'fast-check'
${GUARD}
it.prop('p', { of: [fc.tuple(UserArb)], subject: (u) => u, runs: 100 }, (s, [v]) => v.length === 1)
${GUARD_END}`,
      filename: FILENAME,
    },
    {
      name: 'Should_StaySilent_When_ArbitraryIsArbitrarySchemaDerivation',
      code: `import * as Arbitrary from 'effect/unstable/arbitrary/Arbitrary'
${GUARD}
it.prop('p', { of: [Arbitrary.schema(UserSchema)], subject: (u) => u, runs: 100 }, (s, [v]) => v !== null)
${GUARD_END}`,
      filename: FILENAME,
    },
    {
      name: 'Should_StaySilent_When_ChainIsPipedFromASchema',
      code: `import { Schema as S, pipe } from 'effect'
${GUARD}
it.prop('p', { of: [pipe(S.String, S.filter((s) => s.length > 0))], subject: (s) => s, runs: 100 }, (s, [v]) => v.length > 0)
${GUARD_END}`,
      filename: FILENAME,
    },
    {
      name: 'Should_StaySilent_When_SchemaReceiverCarriesTheChain',
      code: `import { Schema as S } from 'effect'
${GUARD}
it.prop('p', { of: [S.String.pipe(S.filter((s) => s.length > 0))], subject: (s) => s, runs: 100 }, (s, [v]) => v.length > 0)
${GUARD_END}`,
      filename: FILENAME,
    },
    {
      name: 'Should_StaySilent_When_ArbitraryIsAConstDerivedFromASchema',
      code: `import { Schema } from 'effect'
const User = Schema.Struct({ name: Schema.String })
${GUARD}
it.prop('p', { of: [User], subject: (u) => u, runs: 100 }, (s, [v]) => v !== null)
${GUARD_END}`,
      filename: FILENAME,
    },
    {
      name: 'Should_StaySilent_When_ArbitraryCallIsStaticallyOpaque',
      code: `${GUARD}
it.prop('p', { of: [getArb()], subject: (x) => x, runs: 100 }, (s, [v]) => v !== null)
${GUARD_END}`,
      filename: FILENAME,
    },
    {
      name: 'Should_StaySilent_When_ArbitraryIdentifierIsUnresolved',
      code: `${GUARD}
it.prop('p', { of: [externalArb], subject: (x) => x, runs: 100 }, (s, [v]) => v !== null)
${GUARD_END}`,
      filename: FILENAME,
    },
    {
      name: 'Should_StaySilent_When_BindingComesFromAnUnrelatedModule',
      code: `import { genFromHelper } from './helpers.js'
${GUARD}
it.prop('p', { of: [genFromHelper], subject: (x) => x, runs: 100 }, (s, [v]) => v !== null)
${GUARD_END}`,
      filename: FILENAME,
    },
    {
      name: 'Should_StaySilent_When_TypeAssertionWrapsASchema',
      code: `import { Schema } from 'effect'
${GUARD}
it.prop('p', { of: [Schema.String as unknown as Arb], subject: (s) => s, runs: 100 }, (s, [v]) => v !== null)
${GUARD_END}`,
      filename: FILENAME,
    },
    {
      name: 'Should_StaySilent_When_PipeReceivesOnlyOpaqueParts',
      code: `${GUARD}
it.prop('p', { of: [pipe(getArb())], subject: (x) => x, runs: 100 }, (s, [v]) => v !== null)
${GUARD_END}`,
      filename: FILENAME,
    },
    {
      name: 'Should_StaySilent_When_OpaqueReceiverWrapsAHandBuiltArgument',
      code: `import * as fc from 'fast-check'
${GUARD}
it.prop('p', { of: [getBuilder().of(fc.integer())], subject: (x) => x, runs: 100 }, (s, [v]) => v !== null)
${GUARD_END}`,
      filename: FILENAME,
    },
    {
      name: 'Should_StaySilent_When_SpreadArbitrariesAreOpaque',
      code: `${GUARD}
it.prop('p', { of: [...arbs], subject: (x) => x, runs: 100 }, (s, [v]) => v !== null)
${GUARD_END}`,
      filename: FILENAME,
    },
    {
      name: 'Should_StaySilent_When_ThereIsNoArbitrariesArray',
      code: `${GUARD}
it.prop('p', { subject: (x) => x, runs: 100 }, (s, [v]) => v !== null)
${GUARD_END}`,
      filename: FILENAME,
    },
    {
      name: 'Should_StaySilent_When_TheBlockLivesOutsideAGuard',
      code: `import * as fc from 'fast-check'
it.prop('p', { of: [fc.record({ name: fc.string() })], subject: (u) => u, runs: 100 }, (s, [v]) => v !== null)`,
      filename: FILENAME,
    },
    {
      name: 'Should_StaySilent_When_TheIfIsNotAnInSourceGuard',
      code: `import * as fc from 'fast-check'
if (someCondition) {
  it.prop('p', { of: [fc.integer()], subject: (n) => n, runs: 100 }, (s, [v]) => v === v)
}`,
      filename: FILENAME,
    },
    {
      name: 'Should_StaySilent_When_TheGuardTestMentionsSomethingElse',
      code: `import * as fc from 'fast-check'
if (import.meta.env) {
  it.prop('p', { of: [fc.integer()], subject: (n) => n, runs: 100 }, (s, [v]) => v === v)
}`,
      filename: FILENAME,
    },
    {
      name: 'Should_StaySilent_When_TheVitestMemberIsNotImportMeta',
      code: `import * as fc from 'fast-check'
if (a.meta.vitest) {
  it.prop('p', { of: [fc.integer()], subject: (n) => n, runs: 100 }, (s, [v]) => v === v)
}`,
      filename: FILENAME,
    },
    {
      name: 'Should_StaySilent_When_CalleeIsNotAPropertyTest',
      code: `import * as fc from 'fast-check'
${GUARD}
it('example', () => { fc.record({}); return true })
${GUARD_END}`,
      filename: FILENAME,
    },
    {
      name: 'Should_StaySilent_When_ArbitrarySchemaDerivesFromADomainBinding',
      code: `import { Schema } from 'effect'
import * as Arbitrary from 'effect/unstable/arbitrary/Arbitrary'
const Money = Schema.String
${GUARD}
it.prop('p', { of: [Arbitrary.schema(Money)], subject: (s) => s, runs: 100 }, (s, [v]) => v === v)
${GUARD_END}`,
      filename: FILENAME,
    },
    {
      name: 'Should_StaySilent_When_ArbitrarySchemaDerivesFromAnImportedSchema',
      code: `import * as Arbitrary from 'effect/unstable/arbitrary/Arbitrary'
import { Money } from './money.schema.js'
${GUARD}
it.prop('p', { of: [Arbitrary.schema(Money).filter((s) => s.length > 0)], subject: (s) => s, runs: 100 }, (s, [v]) => v === v)
${GUARD_END}`,
      filename: FILENAME,
    },
    {
      name: 'Should_StaySilent_When_RecordOfIsAllSchema',
      code: `import { Schema } from 'effect'
${GUARD}
it.prop('p', { of: { name: Schema.String }, subject: (s) => s, runs: 100 }, (s, [v]) => v !== null)
${GUARD_END}`,
      filename: FILENAME,
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_ConstantCarriesAStaticArray',
      code: `import * as fc from 'fast-check'
${GUARD}
it.prop('p', { of: [fc.constant(['a', 'b'])], subject: (xs) => xs, runs: 100 }, (s, [v]) => v.length === 2)
${GUARD_END}`,
      filename: FILENAME,
      errors: [{ messageId: 'handBuiltArbitrary', data: EXPECTED_DATA }],
    },
    {
      name: 'Should_Report_When_RecordIsHandBuilt',
      code: `import * as fc from 'fast-check'
${GUARD}
it.prop('p', { of: [fc.record({ strategy: fc.constantFrom('one_for_one'), totalChildren: fc.integer({ min: 1, max: 100 }) })], subject: (i) => i, runs: 100 }, (s, [v]) => v !== null)
${GUARD_END}`,
      filename: FILENAME,
      errors: [{ messageId: 'handBuiltArbitrary', data: EXPECTED_DATA }],
    },
    {
      name: 'Should_Report_When_ConstantFromIsHandBuilt',
      code: `import * as fc from 'fast-check'
${GUARD}
it.prop('p', { of: [fc.constantFrom('permanent', 'transient', 'temporary')], subject: (r) => r, runs: 100 }, (s, [v]) => v !== null)
${GUARD_END}`,
      filename: FILENAME,
      errors: [{ messageId: 'handBuiltArbitrary', data: EXPECTED_DATA }],
    },
    {
      name: 'Should_Report_When_OnlySomeElementsAreHandBuilt',
      code: `import { Schema } from 'effect'
import * as fc from 'fast-check'
${GUARD}
it.prop('p', { of: [Schema.String, fc.integer()], subject: (s) => s, runs: 100 }, (s, [v]) => v !== null)
${GUARD_END}`,
      filename: FILENAME,
      errors: [{ messageId: 'handBuiltArbitrary', data: EXPECTED_DATA }],
    },
    {
      name: 'Should_Report_When_RecordOfMixesHandBuiltWithSchema',
      code: `import { Schema } from 'effect'
import * as fc from 'fast-check'
${GUARD}
it.prop('p', { of: { name: Schema.String, count: fc.integer() }, subject: (s) => s, runs: 100 }, (s, [v]) => v !== null)
${GUARD_END}`,
      filename: FILENAME,
      errors: [{ messageId: 'handBuiltArbitrary', data: EXPECTED_DATA }],
    },
    {
      name: 'Should_Report_When_EveryHandBuiltElementReports',
      code: `import * as fc from 'fast-check'
${GUARD}
it.prop('p', { of: [fc.integer(), fc.string()], subject: (n) => n, runs: 100 }, (s, [n, v]) => n !== v)
${GUARD_END}`,
      filename: FILENAME,
      errors: [
        { messageId: 'handBuiltArbitrary', data: EXPECTED_DATA },
        { messageId: 'handBuiltArbitrary', data: EXPECTED_DATA },
      ],
    },
    {
      name: 'Should_Report_When_EffectPropCarriesHandBuilt',
      code: `import * as fc from 'fast-check'
${GUARD}
it.effect.prop('p', { of: [fc.record({ name: fc.string() })], subject: (u) => u, runs: 100 }, (s, [v]) => v !== null)
${GUARD_END}`,
      filename: FILENAME,
      errors: [{ messageId: 'handBuiltArbitrary', data: EXPECTED_DATA }],
    },
    {
      name: 'Should_Report_When_PipeChainIsAllHandBuilt',
      code: `import * as fc from 'fast-check'
${GUARD}
it.prop('p', { of: [pipe(fc.integer({ min: 1 }), fc.string())], subject: (x) => x, runs: 100 }, (s, [v]) => v !== null)
${GUARD_END}`,
      filename: FILENAME,
      errors: [{ messageId: 'handBuiltArbitrary', data: EXPECTED_DATA }],
    },
    {
      name: 'Should_Report_When_ConstHoldsAHandBuiltArbitrary',
      code: `import * as fc from 'fast-check'
const widthPastCap = fc.record({ strategy: fc.constantFrom('one_for_one') })
${GUARD}
it.prop('p', { of: [widthPastCap], subject: (w) => w, runs: 100 }, (s, [v]) => v !== null)
${GUARD_END}`,
      filename: FILENAME,
      errors: [{ messageId: 'handBuiltArbitrary', data: EXPECTED_DATA }],
    },
    {
      name: 'Should_Report_When_FastCheckIsAliasedFromEffect',
      code: `import { FastCheck as myFc } from 'effect'
${GUARD}
it.prop('p', { of: [myFc.constant(1)], subject: (n) => n, runs: 100 }, (s, [v]) => v === v)
${GUARD_END}`,
      filename: FILENAME,
      errors: [{ messageId: 'handBuiltArbitrary', data: EXPECTED_DATA }],
    },
    {
      name: 'Should_Report_When_NamespaceImportFromFastCheck',
      code: `import * as fc from 'fast-check'
${GUARD}
it.prop('p', { of: [fc.constantFrom('a', 'b')], subject: (x) => x, runs: 100 }, (s, [v]) => v !== null)
${GUARD_END}`,
      filename: FILENAME,
      errors: [{ messageId: 'handBuiltArbitrary', data: EXPECTED_DATA }],
    },
    {
      name: 'Should_Report_When_BareMemberRidesAFastCheckNamespace',
      code: `import * as fc from 'fast-check'
${GUARD}
it.prop('p', { of: [fc.string], subject: (s) => s, runs: 100 }, (s, [v]) => v !== null)
${GUARD_END}`,
      filename: FILENAME,
      errors: [{ messageId: 'handBuiltArbitrary', data: EXPECTED_DATA }],
    },
    {
      name: 'Should_Report_When_DefaultImportFromFastCheck',
      code: `import fc from 'fast-check'
${GUARD}
it.prop('p', { of: [fc.constant(0)], subject: (n) => n, runs: 100 }, (s, [v]) => v === v)
${GUARD_END}`,
      filename: FILENAME,
      errors: [{ messageId: 'handBuiltArbitrary', data: EXPECTED_DATA }],
    },
    {
      name: 'Should_Report_When_ReceiverChainIsHandBuilt',
      code: `import * as fc from 'fast-check'
${GUARD}
it.prop('p', { of: [fc.integer({ min: 1 }).map((n) => n * 2)], subject: (n) => n, runs: 100 }, (s, [v]) => v > 0)
${GUARD_END}`,
      filename: FILENAME,
      errors: [{ messageId: 'handBuiltArbitrary', data: EXPECTED_DATA }],
    },
    {
      name: 'Should_Report_When_TypeAssertionHidesHandBuilt',
      code: `import * as fc from 'fast-check'
${GUARD}
it.prop('p', { of: [fc.integer() as unknown as Arb], subject: (n) => n, runs: 100 }, (s, [v]) => v !== null)
${GUARD_END}`,
      filename: FILENAME,
      errors: [{ messageId: 'handBuiltArbitrary', data: EXPECTED_DATA }],
    },
    {
      name: 'Should_Report_When_OptionalChainedHandBuilt',
      code: `import * as fc from 'fast-check'
${GUARD}
it.prop('p', { of: [fc?.constantFrom('a', 'b')], subject: (x) => x, runs: 100 }, (s, [v]) => v !== null)
${GUARD_END}`,
      filename: FILENAME,
      errors: [{ messageId: 'handBuiltArbitrary', data: EXPECTED_DATA }],
    },
    {
      name: 'Should_Report_When_BadArbitraryHidesInElseBranch',
      code: `import * as fc from 'fast-check'
if (import.meta.vitest) {
} else {
  it.prop('p', { of: [fc.integer()], subject: (n) => n, runs: 100 }, (s, [v]) => v === v)
}
`,
      filename: FILENAME,
      errors: [{ messageId: 'handBuiltArbitrary', data: EXPECTED_DATA }],
    },
    {
      name: 'Should_Report_When_NestedGuardWrapsTheBlock',
      code: `import * as fc from 'fast-check'
${GUARD}
${GUARD_BARE}
it.prop('p', { of: [fc.integer()], subject: (n) => n, runs: 100 }, (s, [v]) => v === v)
${GUARD_END}
${GUARD_END}`,
      filename: FILENAME,
      errors: [{ messageId: 'handBuiltArbitrary', data: EXPECTED_DATA }],
    },
    {
      name: 'Should_Report_When_DescribeWrapsTheHandBuilt',
      code: `import * as fc from 'fast-check'
${GUARD}
describe('d', () => {
  it.prop('p', { of: [fc.integer()], subject: (n) => n, runs: 100 }, (s, [v]) => v === v)
})
${GUARD_END}`,
      filename: FILENAME,
      errors: [{ messageId: 'handBuiltArbitrary', data: EXPECTED_DATA }],
    },
    {
      name: 'Should_Report_When_ModifierChainCarriesHandBuilt',
      code: `import * as fc from 'fast-check'
${GUARD}
it.prop.only('p', { of: [fc.integer()], subject: (n) => n, runs: 100 }, (s, [v]) => v === v)
${GUARD_END}`,
      filename: FILENAME,
      errors: [{ messageId: 'handBuiltArbitrary', data: EXPECTED_DATA }],
    },
    {
      name: 'Should_Report_When_ThereIsNoPredicate',
      code: `import * as fc from 'fast-check'
${GUARD}
it.prop('p', { of: [fc.integer()], subject: (n) => n, runs: 100 })
${GUARD_END}`,
      filename: FILENAME,
      errors: [{ messageId: 'handBuiltArbitrary', data: EXPECTED_DATA }],
    },
    {
      name: 'Should_Report_When_HandBuiltConstantRidesADynamicFastCheckImport',
      code: `${GUARD}
const { it } = await import('@systemfsoftware/vitest')
const { FastCheck: fc } = await import('effect/testing')
it.prop('p', { of: [fc.constant({ a: 1 })], subject: (input) => input, runs: 100 }, (s, [v]) => v !== null)
${GUARD_END}`,
      filename: FILENAME,
      errors: [{ messageId: 'handBuiltArbitrary', data: EXPECTED_DATA }],
    },
    {
      name: 'Should_Report_When_HandBuiltMemberRidesADynamicFastCheckImport',
      code: `${GUARD}
const { FastCheck: fc } = await import('effect/testing')
it.prop('p', { of: [fc.integer({ min: 0 })], subject: (n) => n, runs: 100 }, (s, [v]) => v >= 0)
${GUARD_END}`,
      filename: FILENAME,
      errors: [{ messageId: 'handBuiltArbitrary', data: EXPECTED_DATA }],
    },
    {
      name: 'Should_Report_When_ArbitrarySchemaRootIsAStockMember',
      code: `import { Schema } from 'effect'
import * as Arbitrary from 'effect/unstable/arbitrary/Arbitrary'
${GUARD}
it.prop('p', { of: [Arbitrary.schema(Schema.String).filter((s) => s.length > 0)], subject: (s) => s, runs: 100 }, (s, [v]) => v === v)
${GUARD_END}`,
      filename: FILENAME,
      errors: [{ messageId: 'stockDerivedArbitrary', data: STOCK_DATA }],
    },
    {
      name: 'Should_Report_When_OneOfMixesHandBuiltWithSchema',
      code: `import { Schema } from 'effect'
import * as fc from 'fast-check'
${GUARD}
it.prop('p', { of: [fc.oneof(fc.string(), Schema.toArbitrary(UserSchema)(fc))], subject: (u) => u, runs: 100 }, (s, [v]) => v !== null)
${GUARD_END}`,
      filename: FILENAME,
      errors: [{ messageId: 'handBuiltArbitrary', data: EXPECTED_DATA }],
    },
    {
      name: 'Should_Report_When_RecordMixesSchemaFieldWithHandBuilt',
      code: `import { Schema } from 'effect'
import * as fc from 'fast-check'
${GUARD}
it.prop('p', { of: [fc.record({ user: Schema.toArbitrary(UserSchema)(fc), tag: fc.string() })], subject: (r) => r, runs: 100 }, (s, [v]) => v !== null)
${GUARD_END}`,
      filename: FILENAME,
      errors: [{ messageId: 'handBuiltArbitrary', data: EXPECTED_DATA }],
    },
    {
      name: 'Should_Report_When_ArbitrarySchemaRootIsAStockComposition',
      code: `import { Schema } from 'effect'
import * as Arbitrary from 'effect/unstable/arbitrary/Arbitrary'
${GUARD}
it.prop('p', { of: [Arbitrary.schema(Schema.Union([Schema.Literal('a'), Schema.String]))], subject: (s) => s, runs: 100 }, (s, [v]) => v === v)
${GUARD_END}`,
      filename: FILENAME,
      errors: [{ messageId: 'stockDerivedArbitrary', data: STOCK_DATA }],
    },
  ],
})
