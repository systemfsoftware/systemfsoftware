import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'
import { pbtNaming } from '../pbt-naming.js'

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

ruleTester.run('pbt-naming', pbtNaming, {
  valid: [
    {
      name: 'Should_Pass_When_ForAll_EncodeDecode_Equals',
      code: "it.prop('∀x_EncodeDecode_=x', { of: [Schema.String], subject: (s) => s, runs: 100 }, (s, [v]) => v === v)",
    },
    {
      name: 'Should_Pass_When_ForAll_DoubleApply_Equivalent',
      code:
        "it.prop('∀f_DoubleApply_≡f', { of: [Schema.Number], subject: (n) => n, runs: 100 }, (s, [v]) => Math.abs(Math.abs(v)) === Math.abs(v))",
    },
    {
      name: 'Should_Pass_When_ForAll_Addition_Equivalent',
      code:
        "it.effect.prop('∀ab_Add_≡Swapped', { of: [Schema.Number, Schema.Number], subject: (a) => a, runs: 100 }, (s, [a, b]) => a + b === b + a)",
    },
    {
      name: 'Should_Pass_When_Ordered_Input_Produces_Ordered_Output',
      code:
        "it.prop('≤ab_Sort_≤Output', { of: [Schema.Number, Schema.Number], subject: (a) => a, runs: 100 }, (s, [a, b]) => a <= b ? true : true)",
    },
    {
      name: 'Should_Pass_When_Implies_Shipped_IsContradiction',
      code: "it.prop('→Shipped_Cancel_⊥', { of: [Schema.Boolean], subject: (s) => s, runs: 100 }, (s, [v]) => v === v)",
    },
    {
      name: 'Should_Pass_When_BareFalsumNeedsNoOperand',
      code: "it.prop('∀x_AllExhausted_⊥', { of: [Schema.Number], subject: (n) => n, runs: 100 }, (s, [v]) => v === v)",
    },
    {
      name: 'Should_Pass_When_ForAll_FilterSubset_SubsetOfInput',
      code:
        "it.prop('∀items_Filter_⊆Input', { of: [Schema.Number], subject: (n) => n, runs: 100 }, (s, [v]) => v === v)",
    },
    {
      name: 'Should_Pass_When_With_ItEffectProp',
      code:
        "it.effect.prop('∀s_Roundtrip_≡Input', { of: [Schema.String], subject: (s) => s, runs: 100 }, (s, [v]) => v === v)",
    },
    {
      name: 'Should_Ignore_When_NonPropCall',
      code: "it('Should_Work_When_Called', () => {})",
    },
    {
      name: 'Should_Ignore_When_NoTestNameProvided',
      code: 'it.prop()',
    },
    {
      name: 'Should_Ignore_When_TestNameIsVariable',
      code:
        "const name = '∀x_DecodeEncode_=x'; it.prop(name, { of: [Schema.String], subject: (s) => s, runs: 100 }, (s, [v]) => v === v)",
    },
    {
      name: 'Should_Ignore_When_TemplateLiteralHasExpressions',
      code:
        "const suffix = 'Decode'; it.prop(`∀x_Encode${suffix}_=x`, { of: [Schema.String], subject: (s) => s, runs: 100 }, (s, [v]) => v === v)",
    },
    {
      name: 'Should_Pass_When_NonPropMemberExpression',
      code: "it.only('Should_Work_When_Called', () => {})",
    },
    {
      name: 'Should_Ignore_When_PropChainRootIsNotItOrTest',
      code:
        "describe.prop.prop('Should_Throw_When_Invalid', { of: [Schema.String], subject: (s) => s, runs: 100 }, (s, [v]) => v.length > 0)",
    },
    {
      name: 'Should_Pass_When_ForAll_Concat_Equals',
      code:
        "it.prop('∀abc_Concat_≡Regrouped', { of: [Schema.String, Schema.String, Schema.String], subject: (a) => a, runs: 100 }, (s, [a, b, c]) => (a + b) + c === a + (b + c))",
    },
    {
      name: 'Should_Pass_When_Exists_Identity_Equals',
      code:
        "it.prop('∃e_Identity_=Neutral', { of: [Schema.Number], subject: (n) => n, runs: 100 }, (s, [v]) => v + 0 === v)",
    },
    {
      name: 'Should_Pass_When_Negated_Scope',
      code: "it.prop('¬Shipped_Cancel_⊥', { of: [Schema.Boolean], subject: (s) => s, runs: 100 }, (s, [v]) => v === v)",
    },
    {
      name: 'Should_Pass_When_ForAllNot_String',
      code: "it.prop('∀f_Double_≠Zero', { of: [Schema.Number], subject: (n) => n, runs: 100 }, (s, [v]) => v !== 0)",
    },
    {
      name: 'Should_Pass_When_Impossibility_NamesForbiddenOutcome',
      code:
        "it.prop('∀o_ShippedOrder_⊥Cancellable', { of: [Schema.Boolean], subject: (s) => s, runs: 100 }, (s, [v]) => v === v)",
    },
    {
      name: 'Should_Pass_When_MultiCharBinderAndConceptOperand',
      code:
        "it.prop('∀items_Dedupe_⊆Items', { of: [Schema.Number], subject: (n) => n, runs: 100 }, (s, [v]) => v === v)",
    },
    {
      name: 'Should_Pass_When_NumericPredicateOperand',
      code: "it.prop('∀n_Length_=2', { of: [Schema.Number], subject: (n) => n, runs: 100 }, (s, [v]) => v === v)",
    },
    {
      name: 'Should_Pass_When_CompoundLogicalAntecedentInScope',
      code:
        "it.prop('→VoipPush∧Voip_Routing_=Apns', { of: [Schema.Boolean], subject: (s) => s, runs: 100 }, (s, [v]) => v === v)",
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_DAMP_Name',
      code:
        "it.prop('Should_Throw_When_Invalid', { of: [Schema.String], subject: (s) => s, runs: 100 }, (s, [v]) => v.length > 0)",
      errors: [{ messageId: 'invalidSegments', data: { actual: 'Should_Throw_When_Invalid', count: 3 } }],
    },
    {
      name: 'Should_Report_When_NoUnderscore',
      code:
        "it.prop('RoundtripEncodeDecode', { of: [Schema.String], subject: (s) => s, runs: 100 }, (s, [v]) => v === v)",
      errors: [{ messageId: 'invalidSegments' }],
    },
    {
      name: 'Should_Report_When_OneUnderscore',
      code: "it.effect.prop('∀x_Domain', { of: [Schema.String], subject: (s) => s, runs: 100 }, (s, [v]) => v === v)",
      errors: [{ messageId: 'invalidSegments' }],
    },
    {
      name: 'Should_Report_When_ThreeUnderscores',
      code:
        "it.prop('∀x_Encode_Decode_=x', { of: [Schema.String], subject: (s) => s, runs: 100 }, (s, [v]) => v === v)",
      errors: [{ messageId: 'invalidSegments' }],
    },
    {
      name: 'Should_Report_When_ScopeSymbolIsLetter',
      code: "it.prop('Fx_EncodeDecode_=x', { of: [Schema.String], subject: (s) => s, runs: 100 }, (s, [v]) => v === v)",
      errors: [{ messageId: 'invalidScopeSymbol', data: { actual: 'Fx_EncodeDecode_=x', firstChar: 'F' } }],
    },
    {
      name: 'Should_Report_When_EmptyDomain',
      code: "it.prop('∀x__=x', { of: [Schema.String], subject: (s) => s, runs: 100 }, (s, [v]) => v === v)",
      errors: [{ messageId: 'emptyDomain', data: { actual: '∀x__=x' } }],
    },
    {
      name: 'Should_Report_When_DomainLeaksDAMP_When',
      code:
        "it.prop('∀x_RejectedWhenShipped_=x', { of: [Schema.String], subject: (s) => s, runs: 100 }, (s, [v]) => v === v)",
      errors: [{ messageId: 'domainLeaksDAMP', data: { domain: 'RejectedWhenShipped', word: 'When' } }],
    },
    {
      name: 'Should_Report_When_DomainLeaksDAMP_Should',
      code: "it.prop('∀x_ShouldAccept_=x', { of: [Schema.String], subject: (s) => s, runs: 100 }, (s, [v]) => v === v)",
      errors: [{ messageId: 'domainLeaksDAMP', data: { domain: 'ShouldAccept', word: 'Should' } }],
    },
    {
      name: 'Should_Report_When_PredicateSymbolIsLetter',
      code: "it.prop('∀x_EncodeDecode_x', { of: [Schema.String], subject: (s) => s, runs: 100 }, (s, [v]) => v === v)",
      errors: [{ messageId: 'invalidPredicateSymbol', data: { actual: '∀x_EncodeDecode_x', firstChar: 'x' } }],
    },
    {
      name: 'Should_Report_When_PredicateSymbolIsMissing',
      code: "it.prop('∀x_EncodeDecode_', { of: [Schema.String], subject: (s) => s, runs: 100 }, (s, [v]) => v === v)",
      errors: [{ messageId: 'invalidPredicateSymbol', data: { actual: '∀x_EncodeDecode_', firstChar: '' } }],
    },
    {
      name: 'Should_Report_When_ItPropOnly_HasDAMPName',
      code:
        "it.prop.only('Should_Reject_When_Invalid', { of: [Schema.String], subject: (s) => s, runs: 100 }, (s, [v]) => v === v)",
      errors: [{ messageId: 'invalidSegments' }],
    },
    {
      name: 'Should_Report_When_ItEffectPropOnly_HasDAMPName',
      code:
        "it.effect.prop.only('Should_Return_When_Called', { of: [Schema.String], subject: (s) => s, runs: 100 }, (s, [v]) => v === v)",
      errors: [{ messageId: 'invalidSegments' }],
    },
    {
      name: 'Should_Report_When_DomainNotPascalCase',
      code: "it.prop('∀x_domain_=x', { of: [Schema.String], subject: (s) => s, runs: 100 }, (s, [v]) => v === v)",
      errors: [{ messageId: 'emptyDomain' }],
    },
    {
      name: 'Should_Report_When_TestProp_HasDAMPName',
      code:
        "test.prop('Should_Throw_When_Invalid', { of: [Schema.String], subject: (s) => s, runs: 100 }, (s, [v]) => v.length > 0)",
      errors: [{ messageId: 'invalidSegments' }],
    },
    {
      name: 'Should_Report_When_SingleQuasiTemplate_HasBadName',
      code:
        'it.prop(`Roundtrip_Encode_Decode`, { of: [Schema.String], subject: (s) => s, runs: 100 }, (s, [v]) => v === v)',
      errors: [{ messageId: 'invalidScopeSymbol' }],
    },
    {
      name: 'Should_Report_When_ScopeSymbolNotInSet',
      code: "it.prop('∈x_EncodeDecode_=x', { of: [Schema.String], subject: (s) => s, runs: 100 }, (s, [v]) => v === v)",
      errors: [{ messageId: 'invalidScopeSymbol' }],
    },
    {
      name: 'Should_Report_When_PredicateSymbolNotInSet',
      code: "it.prop('∀x_EncodeDecode_∀x', { of: [Schema.String], subject: (s) => s, runs: 100 }, (s, [v]) => v === v)",
      errors: [{ messageId: 'invalidPredicateSymbol' }],
    },
    {
      name: 'Should_Report_When_ScopeBinderMissing',
      code: "it.prop('∀_Domain_=x', { of: [Schema.String], subject: (s) => s, runs: 100 }, (s, [v]) => v === v)",
      errors: [{ messageId: 'incompleteScope', data: { symbol: '∀', scope: '∀' } }],
    },
    {
      name: 'Should_Report_When_PredicateOperandMissingEquals',
      code: "it.prop('∀x_EncodeDecode_=', { of: [Schema.String], subject: (s) => s, runs: 100 }, (s, [v]) => v === v)",
      errors: [{ messageId: 'incompletePredicate', data: { symbol: '=', predicate: '=' } }],
    },
    {
      name: 'Should_Report_When_DomainLeaksDAMP_Given',
      code: "it.prop('∀x_GivenShipped_=x', { of: [Schema.String], subject: (s) => s, runs: 100 }, (s, [v]) => v === v)",
      errors: [{ messageId: 'domainLeaksDAMP', data: { domain: 'GivenShipped', word: 'Given' } }],
    },
  ],
})
