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
      code: "it.prop('∀x_EncodeDecode_=x', [Schema.String], ([s]) => s === s)",
    },
    {
      name: 'Should_Pass_When_ForAll_DoubleApply_Equivalent',
      code: "it.prop('∀f_DoubleApply_≡f', [Schema.Number], ([n]) => Math.abs(Math.abs(n)) === Math.abs(n))",
    },
    {
      name: 'Should_Pass_When_ForAll_Addition_Equivalent',
      code: "it.effect.prop('∀ab_Add_≡Swapped', [Schema.Number, Schema.Number], ([a, b]) => a + b === b + a)",
    },
    {
      name: 'Should_Pass_When_Ordered_Input_Produces_Ordered_Output',
      code: "it.prop('≤ab_Sort_≤Output', [Schema.Number, Schema.Number], ([a, b]) => a <= b ? true : true)",
    },
    {
      name: 'Should_Pass_When_Implies_Shipped_IsContradiction',
      code: "it.prop('→Shipped_Cancel_⊥', [Schema.Boolean], ([s]) => s === s)",
    },
    {
      name: 'Should_Pass_When_BareFalsumNeedsNoOperand',
      code: "it.prop('∀x_AllExhausted_⊥', [Schema.Number], ([n]) => n === n)",
    },
    {
      name: 'Should_Pass_When_ForAll_FilterSubset_SubsetOfInput',
      code: "it.prop('∀items_Filter_⊆Input', [Schema.Number], ([n]) => n === n)",
    },
    {
      name: 'Should_Pass_When_With_ItEffectProp',
      code: "it.effect.prop('∀s_Roundtrip_≡Input', [Schema.String], ([s]) => s === s)",
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
      code: "const name = '∀x_DecodeEncode_=x'; it.prop(name, [Schema.String], ([s]) => s === s)",
    },
    {
      name: 'Should_Ignore_When_TemplateLiteralHasExpressions',
      code: "const suffix = 'Decode'; it.prop(`∀x_Encode${suffix}_=x`, [Schema.String], ([s]) => s === s)",
    },
    {
      name: 'Should_Pass_When_NonPropMemberExpression',
      code: "it.only('Should_Work_When_Called', () => {})",
    },
    {
      name: 'Should_Ignore_When_PropChainRootIsNotItOrTest',
      code: "describe.prop.prop('Should_Throw_When_Invalid', [Schema.String], ([s]) => s.length > 0)",
    },
    {
      name: 'Should_Pass_When_ForAll_Concat_Equals',
      code:
        "it.prop('∀abc_Concat_≡Regrouped', [Schema.String, Schema.String, Schema.String], ([a, b, c]) => (a + b) + c === a + (b + c))",
    },
    {
      name: 'Should_Pass_When_Exists_Identity_Equals',
      code: "it.prop('∃e_Identity_=Neutral', [Schema.Number], ([n]) => n + 0 === n)",
    },
    {
      name: 'Should_Pass_When_Negated_Scope',
      code: "it.prop('¬Shipped_Cancel_⊥', [Schema.Boolean], ([s]) => s === s)",
    },
    {
      name: 'Should_Pass_When_ForAllNot_String',
      code: "it.prop('∀f_Double_≠Zero', [Schema.Number], ([n]) => n !== 0)",
    },
    {
      name: 'Should_Pass_When_Impossibility_NamesForbiddenOutcome',
      code: "it.prop('∀o_ShippedOrder_⊥Cancellable', [Schema.Boolean], ([s]) => s === s)",
    },
    {
      name: 'Should_Pass_When_MultiCharBinderAndConceptOperand',
      code: "it.prop('∀items_Dedupe_⊆Items', [Schema.Number], ([n]) => n === n)",
    },
    {
      name: 'Should_Pass_When_NumericPredicateOperand',
      code: "it.prop('∀n_Length_=2', [Schema.Number], ([n]) => n === n)",
    },
    {
      name: 'Should_Pass_When_CompoundLogicalAntecedentInScope',
      code: "it.prop('→VoipPush∧Voip_Routing_=Apns', [Schema.Boolean], ([s]) => s === s)",
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_DAMP_Name',
      code: "it.prop('Should_Throw_When_Invalid', [Schema.String], ([s]) => s.length > 0)",
      errors: [{ messageId: 'invalidSegments', data: { actual: 'Should_Throw_When_Invalid', count: 3 } }],
    },
    {
      name: 'Should_Report_When_NoUnderscore',
      code: "it.prop('RoundtripEncodeDecode', [Schema.String], ([s]) => s === s)",
      errors: [{ messageId: 'invalidSegments' }],
    },
    {
      name: 'Should_Report_When_OneUnderscore',
      code: "it.effect.prop('∀x_Domain', [Schema.String], ([s]) => s === s)",
      errors: [{ messageId: 'invalidSegments' }],
    },
    {
      name: 'Should_Report_When_ThreeUnderscores',
      code: "it.prop('∀x_Encode_Decode_=x', [Schema.String], ([s]) => s === s)",
      errors: [{ messageId: 'invalidSegments' }],
    },
    {
      name: 'Should_Report_When_ScopeSymbolIsLetter',
      code: "it.prop('Fx_EncodeDecode_=x', [Schema.String], ([s]) => s === s)",
      errors: [{ messageId: 'invalidScopeSymbol', data: { actual: 'Fx_EncodeDecode_=x', firstChar: 'F' } }],
    },
    {
      name: 'Should_Report_When_EmptyDomain',
      code: "it.prop('∀x__=x', [Schema.String], ([s]) => s === s)",
      errors: [{ messageId: 'emptyDomain', data: { actual: '∀x__=x' } }],
    },
    {
      name: 'Should_Report_When_DomainLeaksDAMP_When',
      code: "it.prop('∀x_RejectedWhenShipped_=x', [Schema.String], ([s]) => s === s)",
      errors: [{ messageId: 'domainLeaksDAMP', data: { domain: 'RejectedWhenShipped', word: 'When' } }],
    },
    {
      name: 'Should_Report_When_DomainLeaksDAMP_Should',
      code: "it.prop('∀x_ShouldAccept_=x', [Schema.String], ([s]) => s === s)",
      errors: [{ messageId: 'domainLeaksDAMP', data: { domain: 'ShouldAccept', word: 'Should' } }],
    },
    {
      name: 'Should_Report_When_PredicateSymbolIsLetter',
      code: "it.prop('∀x_EncodeDecode_x', [Schema.String], ([s]) => s === s)",
      errors: [{ messageId: 'invalidPredicateSymbol', data: { actual: '∀x_EncodeDecode_x', firstChar: 'x' } }],
    },
    {
      name: 'Should_Report_When_PredicateSymbolIsMissing',
      code: "it.prop('∀x_EncodeDecode_', [Schema.String], ([s]) => s === s)",
      errors: [{ messageId: 'invalidPredicateSymbol', data: { actual: '∀x_EncodeDecode_', firstChar: '' } }],
    },
    {
      name: 'Should_Report_When_ItPropOnly_HasDAMPName',
      code: "it.prop.only('Should_Reject_When_Invalid', [Schema.String], ([s]) => s === s)",
      errors: [{ messageId: 'invalidSegments' }],
    },
    {
      name: 'Should_Report_When_ItEffectPropOnly_HasDAMPName',
      code: "it.effect.prop.only('Should_Return_When_Called', [Schema.String], ([s]) => s === s)",
      errors: [{ messageId: 'invalidSegments' }],
    },
    {
      name: 'Should_Report_When_DomainNotPascalCase',
      code: "it.prop('∀x_domain_=x', [Schema.String], ([s]) => s === s)",
      errors: [{ messageId: 'emptyDomain' }],
    },
    {
      name: 'Should_Report_When_TestProp_HasDAMPName',
      code: "test.prop('Should_Throw_When_Invalid', [Schema.String], ([s]) => s.length > 0)",
      errors: [{ messageId: 'invalidSegments' }],
    },
    {
      name: 'Should_Report_When_SingleQuasiTemplate_HasBadName',
      code: 'it.prop(`Roundtrip_Encode_Decode`, [Schema.String], ([s]) => s === s)',
      errors: [{ messageId: 'invalidScopeSymbol' }],
    },
    {
      name: 'Should_Report_When_ScopeSymbolNotInSet',
      code: "it.prop('∈x_EncodeDecode_=x', [Schema.String], ([s]) => s === s)",
      errors: [{ messageId: 'invalidScopeSymbol' }],
    },
    {
      name: 'Should_Report_When_PredicateSymbolNotInSet',
      code: "it.prop('∀x_EncodeDecode_∀x', [Schema.String], ([s]) => s === s)",
      errors: [{ messageId: 'invalidPredicateSymbol' }],
    },
    {
      name: 'Should_Report_When_ScopeBinderMissing',
      code: "it.prop('∀_Domain_=x', [Schema.String], ([s]) => s === s)",
      errors: [{ messageId: 'incompleteScope', data: { symbol: '∀', scope: '∀' } }],
    },
    {
      name: 'Should_Report_When_PredicateOperandMissingEquals',
      code: "it.prop('∀x_EncodeDecode_=', [Schema.String], ([s]) => s === s)",
      errors: [{ messageId: 'incompletePredicate', data: { symbol: '=', predicate: '=' } }],
    },
    {
      name: 'Should_Report_When_DomainLeaksDAMP_Given',
      code: "it.prop('∀x_GivenShipped_=x', [Schema.String], ([s]) => s === s)",
      errors: [{ messageId: 'domainLeaksDAMP', data: { domain: 'GivenShipped', word: 'Given' } }],
    },
  ],
})
