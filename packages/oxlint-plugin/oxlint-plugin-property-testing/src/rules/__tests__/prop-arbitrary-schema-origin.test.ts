import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { ACTUAL, EXPECTED, FIX, VIOLATION_NAME } from '../prop-arbitrary-schema-origin.config.js'
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

const GUARD = 'if (import.meta.vitest !== void 0) {'
const GUARD_BARE = 'if (import.meta.vitest) {'
const GUARD_END = '}'

ruleTester.run('prop-arbitrary-schema-origin', propArbitrarySchemaOrigin, {
  valid: [
    {
      name: 'Should_StaySilent_When_ArbitraryIsASchemaReference',
      code: `import { Schema } from 'effect'
${GUARD}
it.prop('p', [Schema.String], ([s]) => s === s)
${GUARD_END}`,
      filename: FILENAME,
    },
    {
      name: 'Should_StaySilent_When_SchemaImportIsAliased',
      code: `import { Schema as S } from 'effect'
${GUARD_BARE}
it.prop('p', [S.String], ([s]) => s === s)
${GUARD_END}`,
      filename: FILENAME,
    },
    {
      name: 'Should_StaySilent_When_SchemaComesFromARelativeSchemaModule',
      code: `import { UserSchema } from './User.schema.js'
${GUARD}
it.prop('p', [UserSchema], ([u]) => u !== null)
${GUARD_END}`,
      filename: FILENAME,
    },
    {
      name: 'Should_StaySilent_When_RelativeSchemaArbitraryFeedsAFastCheckCombinator',
      code: `import { UserArb } from './User.schema.js'
import * as fc from 'fast-check'
${GUARD}
it.prop('p', [fc.tuple(UserArb)], ([u]) => u.length === 1)
${GUARD_END}`,
      filename: FILENAME,
    },
    {
      name: 'Should_StaySilent_When_ArbitraryIsTheToArbitraryAnnotation',
      code: `import { Schema } from 'effect'
import * as fc from 'fast-check'
${GUARD}
it.prop('p', [Schema.toArbitrary(UserSchema)(fc)], ([u]) => u !== null)
${GUARD_END}`,
      filename: FILENAME,
    },
    {
      name: 'Should_StaySilent_When_ChainIsPipedFromASchema',
      code: `import { Schema as S, pipe } from 'effect'
${GUARD}
it.prop('p', [pipe(S.String, S.filter((s) => s.length > 0))], ([s]) => s.length > 0)
${GUARD_END}`,
      filename: FILENAME,
    },
    {
      name: 'Should_StaySilent_When_SchemaReceiverCarriesTheChain',
      code: `import { Schema as S } from 'effect'
${GUARD}
it.prop('p', [S.String.pipe(S.filter((s) => s.length > 0))], ([s]) => s.length > 0)
${GUARD_END}`,
      filename: FILENAME,
    },
    {
      name: 'Should_StaySilent_When_ArbitraryIsAConstDerivedFromASchema',
      code: `import { Schema } from 'effect'
const User = Schema.Struct({ name: Schema.String })
${GUARD}
it.prop('p', [User], ([u]) => u !== null)
${GUARD_END}`,
      filename: FILENAME,
    },
    {
      name: 'Should_StaySilent_When_FastCheckCombinatorWrapsASchemaArbitrary',
      code: `import { Schema } from 'effect'
import * as fc from 'fast-check'
${GUARD}
it.prop('p', [fc.oneof(fc.string(), Schema.toArbitrary(UserSchema)(fc))], ([u]) => u !== null)
${GUARD_END}`,
      filename: FILENAME,
    },
    {
      name: 'Should_StaySilent_When_ArbitraryCallIsStaticallyOpaque',
      code: `${GUARD}
it.prop('p', [getArb()], ([x]) => x !== null)
${GUARD_END}`,
      filename: FILENAME,
    },
    {
      name: 'Should_StaySilent_When_RecordObjectContainsASchemaDerivedField',
      code: `import { Schema } from 'effect'
import * as fc from 'fast-check'
${GUARD}
it.prop('p', [fc.record({ user: Schema.toArbitrary(UserSchema)(fc), tag: fc.string() })], ([r]) => r !== null)
${GUARD_END}`,
      filename: FILENAME,
    },
    {
      name: 'Should_StaySilent_When_ArbitraryIdentifierIsUnresolved',
      code: `${GUARD}
it.prop('p', [externalArb], ([x]) => x !== null)
${GUARD_END}`,
      filename: FILENAME,
    },
    {
      name: 'Should_StaySilent_When_BindingComesFromAnUnrelatedModule',
      code: `import { genFromHelper } from './helpers.js'
${GUARD}
it.prop('p', [genFromHelper], ([x]) => x !== null)
${GUARD_END}`,
      filename: FILENAME,
    },
    {
      name: 'Should_StaySilent_When_TypeAssertionWrapsASchema',
      code: `import { Schema } from 'effect'
${GUARD}
it.prop('p', [Schema.String as unknown as Arb], ([s]) => s !== null)
${GUARD_END}`,
      filename: FILENAME,
    },
    {
      name: 'Should_StaySilent_When_PipeReceivesOnlyOpaqueParts',
      code: `${GUARD}
it.prop('p', [pipe(getArb())], ([x]) => x !== null)
${GUARD_END}`,
      filename: FILENAME,
    },
    {
      name: 'Should_StaySilent_When_OpaqueReceiverWrapsAHandBuiltArgument',
      code: `import * as fc from 'fast-check'
${GUARD}
it.prop('p', [getBuilder().of(fc.integer())], ([x]) => x !== null)
${GUARD_END}`,
      filename: FILENAME,
    },
    {
      name: 'Should_StaySilent_When_SpreadArbitrariesAreOpaque',
      code: `${GUARD}
it.prop('p', [...arbs], ([x]) => x !== null)
${GUARD_END}`,
      filename: FILENAME,
    },
    {
      name: 'Should_StaySilent_When_ThereIsNoArbitrariesArray',
      code: `${GUARD}
it.prop('p')
${GUARD_END}`,
      filename: FILENAME,
    },
    {
      name: 'Should_StaySilent_When_TheBlockLivesOutsideAGuard',
      code: `import * as fc from 'fast-check'
it.prop('p', [fc.record({ name: fc.string() })], ([u]) => u !== null)`,
      filename: FILENAME,
    },
    {
      name: 'Should_StaySilent_When_TheIfIsNotAnInSourceGuard',
      code: `import * as fc from 'fast-check'
if (someCondition) {
  it.prop('p', [fc.integer()], ([n]) => n === n)
}`,
      filename: FILENAME,
    },
    {
      name: 'Should_StaySilent_When_TheGuardTestMentionsSomethingElse',
      code: `import * as fc from 'fast-check'
if (import.meta.env) {
  it.prop('p', [fc.integer()], ([n]) => n === n)
}`,
      filename: FILENAME,
    },
    {
      name: 'Should_StaySilent_When_TheVitestMemberIsNotImportMeta',
      code: `import * as fc from 'fast-check'
if (a.meta.vitest) {
  it.prop('p', [fc.integer()], ([n]) => n === n)
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
  ],
  invalid: [
    {
      name: 'Should_Report_When_ConstantCarriesAStaticArray',
      code: `import * as fc from 'fast-check'
${GUARD}
it.prop('p', [fc.constant(['a', 'b'])], ([xs]) => xs.length === 2)
${GUARD_END}`,
      filename: FILENAME,
      errors: [{ messageId: 'handBuiltArbitrary', data: EXPECTED_DATA }],
    },
    {
      name: 'Should_Report_When_RecordIsHandBuilt',
      code: `import * as fc from 'fast-check'
${GUARD}
it.prop('p', [fc.record({ strategy: fc.constantFrom('one_for_one'), totalChildren: fc.integer({ min: 1, max: 100 }) })], ([i]) => i !== null)
${GUARD_END}`,
      filename: FILENAME,
      errors: [{ messageId: 'handBuiltArbitrary', data: EXPECTED_DATA }],
    },
    {
      name: 'Should_Report_When_ConstantFromIsHandBuilt',
      code: `import * as fc from 'fast-check'
${GUARD}
it.prop('p', [fc.constantFrom('permanent', 'transient', 'temporary')], ([r]) => r !== null)
${GUARD_END}`,
      filename: FILENAME,
      errors: [{ messageId: 'handBuiltArbitrary', data: EXPECTED_DATA }],
    },
    {
      name: 'Should_Report_When_OnlySomeElementsAreHandBuilt',
      code: `import { Schema } from 'effect'
import * as fc from 'fast-check'
${GUARD}
it.prop('p', [Schema.String, fc.integer()], ([s]) => s !== null)
${GUARD_END}`,
      filename: FILENAME,
      errors: [{ messageId: 'handBuiltArbitrary', data: EXPECTED_DATA }],
    },
    {
      name: 'Should_Report_When_EveryHandBuiltElementReports',
      code: `import * as fc from 'fast-check'
${GUARD}
it.prop('p', [fc.integer(), fc.string()], ([n, s]) => n !== s)
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
it.effect.prop('p', [fc.record({ name: fc.string() })], ([u]) => u !== null)
${GUARD_END}`,
      filename: FILENAME,
      errors: [{ messageId: 'handBuiltArbitrary', data: EXPECTED_DATA }],
    },
    {
      name: 'Should_Report_When_PipeChainIsAllHandBuilt',
      code: `import * as fc from 'fast-check'
${GUARD}
it.prop('p', [pipe(fc.integer({ min: 1 }), fc.string())], ([x]) => x !== null)
${GUARD_END}`,
      filename: FILENAME,
      errors: [{ messageId: 'handBuiltArbitrary', data: EXPECTED_DATA }],
    },
    {
      name: 'Should_Report_When_ConstHoldsAHandBuiltArbitrary',
      code: `import * as fc from 'fast-check'
const widthPastCap = fc.record({ strategy: fc.constantFrom('one_for_one') })
${GUARD}
it.prop('p', [widthPastCap], ([w]) => w !== null)
${GUARD_END}`,
      filename: FILENAME,
      errors: [{ messageId: 'handBuiltArbitrary', data: EXPECTED_DATA }],
    },
    {
      name: 'Should_Report_When_FastCheckIsAliasedFromEffect',
      code: `import { FastCheck as myFc } from 'effect'
${GUARD}
it.prop('p', [myFc.constant(1)], ([n]) => n === n)
${GUARD_END}`,
      filename: FILENAME,
      errors: [{ messageId: 'handBuiltArbitrary', data: EXPECTED_DATA }],
    },
    {
      name: 'Should_Report_When_NamespaceImportFromFastCheck',
      code: `import * as fc from 'fast-check'
${GUARD}
it.prop('p', [fc.constantFrom('a', 'b')], ([x]) => x !== null)
${GUARD_END}`,
      filename: FILENAME,
      errors: [{ messageId: 'handBuiltArbitrary', data: EXPECTED_DATA }],
    },
    {
      name: 'Should_Report_When_BareMemberRidesAFastCheckNamespace',
      code: `import * as fc from 'fast-check'
${GUARD}
it.prop('p', [fc.string], ([s]) => s !== null)
${GUARD_END}`,
      filename: FILENAME,
      errors: [{ messageId: 'handBuiltArbitrary', data: EXPECTED_DATA }],
    },
    {
      name: 'Should_Report_When_DefaultImportFromFastCheck',
      code: `import fc from 'fast-check'
${GUARD}
it.prop('p', [fc.constant(0)], ([n]) => n === n)
${GUARD_END}`,
      filename: FILENAME,
      errors: [{ messageId: 'handBuiltArbitrary', data: EXPECTED_DATA }],
    },
    {
      name: 'Should_Report_When_ReceiverChainIsHandBuilt',
      code: `import * as fc from 'fast-check'
${GUARD}
it.prop('p', [fc.integer({ min: 1 }).map((n) => n * 2)], ([n]) => n > 0)
${GUARD_END}`,
      filename: FILENAME,
      errors: [{ messageId: 'handBuiltArbitrary', data: EXPECTED_DATA }],
    },
    {
      name: 'Should_Report_When_TypeAssertionHidesHandBuilt',
      code: `import * as fc from 'fast-check'
${GUARD}
it.prop('p', [fc.integer() as unknown as Arb], ([n]) => n !== null)
${GUARD_END}`,
      filename: FILENAME,
      errors: [{ messageId: 'handBuiltArbitrary', data: EXPECTED_DATA }],
    },
    {
      name: 'Should_Report_When_OptionalChainedHandBuilt',
      code: `import * as fc from 'fast-check'
${GUARD}
it.prop('p', [fc?.constantFrom('a', 'b')], ([x]) => x !== null)
${GUARD_END}`,
      filename: FILENAME,
      errors: [{ messageId: 'handBuiltArbitrary', data: EXPECTED_DATA }],
    },
    {
      name: 'Should_Report_When_BadArbitraryHidesInElseBranch',
      code: `import * as fc from 'fast-check'
if (import.meta.vitest) {
} else {
  it.prop('p', [fc.integer()], ([n]) => n === n)
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
it.prop('p', [fc.integer()], ([n]) => n === n)
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
  it.prop('p', [fc.integer()], ([n]) => n === n)
})
${GUARD_END}`,
      filename: FILENAME,
      errors: [{ messageId: 'handBuiltArbitrary', data: EXPECTED_DATA }],
    },
    {
      name: 'Should_Report_When_ModifierChainCarriesHandBuilt',
      code: `import * as fc from 'fast-check'
${GUARD}
it.prop.only('p', [fc.integer()], ([n]) => n === n)
${GUARD_END}`,
      filename: FILENAME,
      errors: [{ messageId: 'handBuiltArbitrary', data: EXPECTED_DATA }],
    },
    {
      name: 'Should_Report_When_ThereIsNoPredicate',
      code: `import * as fc from 'fast-check'
${GUARD}
it.prop('p', [fc.integer()])
${GUARD_END}`,
      filename: FILENAME,
      errors: [{ messageId: 'handBuiltArbitrary', data: EXPECTED_DATA }],
    },
    {
      name: 'Should_Report_When_HandBuiltConstantRidesADynamicFastCheckImport',
      code: `${GUARD}
const { it } = await import('@effect/vitest')
const { FastCheck: fc } = await import('effect/testing')
it.prop('p', [fc.constant({ a: 1 })], ([input]) => input !== null)
${GUARD_END}`,
      filename: FILENAME,
      errors: [{ messageId: 'handBuiltArbitrary', data: EXPECTED_DATA }],
    },
    {
      name: 'Should_Report_When_HandBuiltMemberRidesADynamicFastCheckImport',
      code: `${GUARD}
const { FastCheck: fc } = await import('effect/testing')
it.prop('p', [fc.integer({ min: 0 })], ([n]) => n >= 0)
${GUARD_END}`,
      filename: FILENAME,
      errors: [{ messageId: 'handBuiltArbitrary', data: EXPECTED_DATA }],
    },
  ],
})
