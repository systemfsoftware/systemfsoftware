import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { noSilentReturn } from '../no-silent-return.js'

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

const FILENAME = 'src/calc.property.test.ts'

ruleTester.run('no-silent-return', noSilentReturn, {
  valid: [
    {
      name: 'Should_Pass_When_ExpressionBodyIsComparison',
      code: `it.prop('∀n_X_=x', [fc.integer()], ([n]) => n === n)`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_ExpressionBodyIsCall',
      code: `it.prop('∀s_X_∈Valid', [fc.string()], ([s]) => isValid(s))`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_ExpressionBodyIsIdentifier',
      code: `it.prop('∀s_X_∈Valid', [fc.string()], ([s]) => verdict)`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_BlockEndsWithBooleanReturn',
      code: `it.prop('∀n_X_=x', [fc.integer()], ([n]) => { const d = n * 2; return d === n + n })`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_IfElseBothReturn',
      code: `it.prop('∀n_X_=x', [fc.integer()], ([n]) => { if (n > 0) { return n > 0 } else { return n <= 0 } })`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_ThrowExitsBeforeReturn',
      code: `it.prop('∀n_X_=x', [fc.integer()], ([n]) => { if (n === 0) throw new Error('zero'); return n !== 0 })`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_SwitchAllCasesReturnWithDefault',
      code:
        `it.prop('∀n_X_=x', [fc.integer()], ([n]) => { switch (n) { case 0: return true; default: return n !== 0 } })`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_TryCatchBothReturn',
      code: `it.prop('∀s_X_=x', [fc.string()], ([s]) => { try { return parse(s) === s } catch { return false } })`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_ConditionalExpression',
      code: `it.prop('≤ab_Sort_≤Out', [fc.integer(), fc.integer()], ([a, b]) => a <= b ? true : check(b))`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_LogicalAndOfCalls',
      code: `it.prop('∀r_X_=x', [arb], ([r]) => isRight(r) && eq(r.right, r.left))`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_IdentifierReturnTrusted',
      code: `it.prop('∀n_X_=x', [fc.integer()], ([n]) => { const verdict = n === n; return verdict })`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_NonGeneratorNestedFunctionBareReturn',
      code:
        `it.prop('∀xs_X_=x', [fc.array(fc.integer())], ([xs]) => { xs.forEach((x) => { return; }); return xs.length >= 0 })`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_EffectPropGeneratorReturnsBoolean',
      code:
        `it.effect.prop('∀x_X_=x', [arb], ([x]) => Effect.gen(function*() { const y = yield* load(x); return y === x }))`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_PropOnlyModifier',
      code: `it.prop.only('∀n_X_=x', [fc.integer()], ([n]) => n === n)`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_NotAPropCall',
      code: `it('plain test', () => { const x = 1 })`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_TSTypeAssertionOfComparison',
      code: `it.prop('∀n_X_=x', [fc.integer()], ([n]) => (n === n) as boolean)`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_LooseEqualityOperator',
      code: `it.prop('∀ab_X_=x', [a, b], ([x, y]) => x == y)`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_LooseInequalityOperator',
      code: `it.prop('∀ab_X_=x', [a, b], ([x, y]) => x != y)`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_InstanceofOperator',
      code: `it.prop('∀x_X_∈Error', [a], ([x]) => x instanceof Error)`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_InOperator',
      code: `it.prop('∀x_K_∈x', [a], ([x]) => 'k' in x)`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_OptionalChainingCall',
      code: `it.prop('∀xs_X_≥0', [xs], ([vs]) => vs?.every((v) => v > 0))`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_NegationOfCall',
      code: `it.prop('∀x_¬Valid_⊥', [x], ([v]) => !isValid(v))`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_AngleBracketAssertion',
      code: `it.prop('∀n_X_=x', [n], ([v]) => <boolean>(v === v))`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_PropOnNonItObject',
      code: `foo.prop('x', [a], ([x]) => { return; })`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_EffectLikeNonEffectMember',
      code: `it.effectX.prop('x', [a], ([x]) => { return; })`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_EffectPropOnNonItObject',
      code: `foo.effect.prop('x', [a], ([x]) => { return; })`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_NonModifierAfterProp',
      code: `it.prop.foo('x', [a], ([x]) => { return; })`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_BarePropIdentifierCallee',
      code: `prop('x', [a], ([x]) => { return; })`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_ComputedPropAccess',
      code: `it['prop']('x', [a], ([x]) => { return; })`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_NoPredicateArgument',
      code: `it.prop('x', [arb])`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_NestedFunctionExpressionBareReturn',
      code: `it.prop('x', [xs], ([vs]) => { vs.forEach(function () { return; }); return vs.length >= 0 })`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_GeneratorInsideNestedArrow',
      code: `it.prop('x', [a], ([x]) => { const f = () => Effect.gen(function* () { return; }); return x === x })`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_NonGeneratorFunctionDeclarationBareReturn',
      code: `it.prop('x', [a], ([x]) => { function helper() { return; } helper(); return x === x })`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_SatisfiesOfComparison',
      code: `it.prop('∀n_X_=x', [n], ([v]) => (v === v) satisfies boolean)`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_NonNullAssertionOfCall',
      code: `it.prop('∀x_X_∈Valid', [x], ([v]) => check(v)!)`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_AwaitedCall',
      code: `it.prop('∀x_X_∈Valid', [x], async ([v]) => await check(v))`,
      filename: FILENAME,
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_BareReturn',
      code: `it.prop('→Positive_X_<1', [fc.integer()], ([n]) => { if (n <= 0) return; return 1 / n < 1 })`,
      filename: FILENAME,
      errors: [
        {
          messageId: 'bareReturn',
          data: {
            name: 'A silent exit from a property predicate',
            expected: 'return <boolean> on every code path — fast-check counts undefined as success',
            actual: 'bare `return;` — the predicate exits with undefined, a silent pass',
            fix: 'return a boolean verdict; to skip an input dynamically, call fc.pre(condition) instead',
          },
        },
      ],
    },
    {
      name: 'Should_Report_When_FallOffEnd',
      code: `it.prop('∀n_X_=x', [fc.integer()], ([n]) => { const d = n * 2; d === n + n })`,
      filename: FILENAME,
      errors: [
        {
          messageId: 'missingReturn',
          data: {
            name: 'A silent exit from a property predicate',
            expected: 'return <boolean> on every code path — fast-check counts undefined as success',
            actual: 'the predicate can fall off the end without returning — undefined is a silent pass',
            fix: 'return a boolean verdict; to skip an input dynamically, call fc.pre(condition) instead',
          },
        },
      ],
    },
    {
      name: 'Should_Report_When_NumericLiteralReturn',
      code: `it.prop('∀n_X_=x', [fc.integer()], ([n]) => { return 42 })`,
      filename: FILENAME,
      errors: [
        {
          messageId: 'nonBooleanReturn',
          data: {
            name: 'A silent exit from a property predicate',
            expected: 'return <boolean> on every code path — fast-check counts undefined as success',
            actual: 'return of a non-boolean Literal',
            fix: 'return a boolean verdict; to skip an input dynamically, call fc.pre(condition) instead',
          },
        },
      ],
    },
    {
      name: 'Should_Report_When_ArithmeticReturn',
      code: `it.prop('∀n_X_=x', [fc.integer()], ([n]) => { return n + 1 })`,
      filename: FILENAME,
      errors: [
        {
          messageId: 'nonBooleanReturn',
          data: {
            name: 'A silent exit from a property predicate',
            expected: 'return <boolean> on every code path — fast-check counts undefined as success',
            actual: 'return of a non-boolean BinaryExpression',
            fix: 'return a boolean verdict; to skip an input dynamically, call fc.pre(condition) instead',
          },
        },
      ],
    },
    {
      name: 'Should_Report_When_IfWithoutElseFalls',
      code: `it.prop('∀n_X_=x', [fc.integer()], ([n]) => { if (n > 0) return n === n })`,
      filename: FILENAME,
      errors: [{ messageId: 'missingReturn' }],
    },
    {
      name: 'Should_Report_When_ExpressionBodyArithmetic',
      code: `it.prop('∀n_X_=x', [fc.integer()], ([n]) => n + 1)`,
      filename: FILENAME,
      errors: [
        {
          messageId: 'nonBooleanBody',
          data: {
            name: 'A silent exit from a property predicate',
            expected: 'return <boolean> on every code path — fast-check counts undefined as success',
            actual: 'predicate body is a non-boolean BinaryExpression',
            fix: 'return a boolean verdict; to skip an input dynamically, call fc.pre(condition) instead',
          },
        },
      ],
    },
    {
      name: 'Should_Report_When_ExpressionBodyNullishCoalescing',
      code: `it.prop('∀a_X_=x', [arb], ([a]) => a ?? true)`,
      filename: FILENAME,
      errors: [{ messageId: 'nonBooleanBody' }],
    },
    {
      name: 'Should_Report_When_ReturnNullishCoalescing',
      code: `it.prop('∀a_X_=x', [arb], ([a]) => { return a ?? true })`,
      filename: FILENAME,
      errors: [{ messageId: 'nonBooleanReturn' }],
    },
    {
      name: 'Should_Report_When_EffectPropGeneratorFallsOff',
      code: `it.effect.prop('∀x_X_=x', [arb], ([x]) => Effect.gen(function*() { const y = yield* load(x); y === x }))`,
      filename: FILENAME,
      errors: [{ messageId: 'missingReturn' }],
    },
    {
      name: 'Should_Report_When_EffectPropGeneratorBareReturn',
      code:
        `it.effect.prop('∀x_X_=x', [arb], ([x]) => Effect.gen(function*() { if (x === null) return; return x !== null }))`,
      filename: FILENAME,
      errors: [{ messageId: 'bareReturn' }],
    },
    {
      name: 'Should_Report_When_SwitchMissingDefault',
      code: `it.prop('∀n_X_=x', [fc.integer()], ([n]) => { switch (n) { case 0: return true; case 1: return false } })`,
      filename: FILENAME,
      errors: [{ messageId: 'missingReturn' }],
    },
    {
      name: 'Should_Report_When_PropSkipModifierBareReturn',
      code: `it.prop.skip('∀n_X_=x', [fc.integer()], ([n]) => { if (n <= 0) return; return n > 0 })`,
      filename: FILENAME,
      errors: [{ messageId: 'bareReturn' }],
    },
    {
      name: 'Should_Report_When_TryWithoutCatchFalls',
      code: `it.prop('∀s_X_=x', [fc.string()], ([s]) => { try { parse(s) } finally { cleanup() } })`,
      filename: FILENAME,
      errors: [{ messageId: 'missingReturn' }],
    },
    {
      name: 'Should_Report_When_ConditionalAlternateNonBoolean',
      code: `it.prop('∀x_X_=x', [a], ([x]) => x > 0 ? check(x) : x + 1)`,
      filename: FILENAME,
      errors: [{ messageId: 'nonBooleanBody' }],
    },
    {
      name: 'Should_Report_When_BareReturnInElse',
      code: `it.prop('∀v_X_=x', [n], ([v]) => { if (v > 0) { return true } else { return; } })`,
      filename: FILENAME,
      errors: [{ messageId: 'bareReturn' }],
    },
    {
      name: 'Should_Report_When_BareReturnInTry',
      code: `it.prop('∀v_X_=x', [n], ([v]) => { try { return; } catch { return true } })`,
      filename: FILENAME,
      errors: [{ messageId: 'bareReturn' }],
    },
    {
      name: 'Should_Report_When_BareReturnInCatch',
      code: `it.prop('∀v_X_=x', [n], ([v]) => { try { return true } catch { return; } })`,
      filename: FILENAME,
      errors: [{ messageId: 'bareReturn' }],
    },
    {
      name: 'Should_Report_When_BareReturnInFinally',
      code: `it.prop('∀v_X_=x', [n], ([v]) => { try { return true } finally { return; } })`,
      filename: FILENAME,
      errors: [{ messageId: 'bareReturn' }],
    },
    {
      name: 'Should_Report_When_SwitchDefaultFallsThrough',
      code: `it.prop('∀v_X_=x', [n], ([v]) => { switch (v) { case 0: return true; default: v } })`,
      filename: FILENAME,
      errors: [{ messageId: 'missingReturn' }],
    },
    {
      name: 'Should_Report_When_PropTodoModifierBareReturn',
      code: `it.prop.todo('∀v_X_=x', [n], ([v]) => { if (v <= 0) return; return v > 0 })`,
      filename: FILENAME,
      errors: [{ messageId: 'bareReturn' }],
    },
    {
      name: 'Should_Report_When_ExpressionBodyObjectLiteral',
      code: `it.prop('∀x_X_=x', [a], ([x]) => ({ a: x }))`,
      filename: FILENAME,
      errors: [{ messageId: 'nonBooleanBody' }],
    },
    {
      name: 'Should_Report_When_LogicalRightArithmetic',
      code: `it.prop('∀x_X_=x', [a], ([x]) => { return check(x) && x + 1 })`,
      filename: FILENAME,
      errors: [{ messageId: 'nonBooleanReturn' }],
    },
    {
      name: 'Should_Report_When_BareReturnInsideLoop',
      code: `it.prop('∀xs_X_=x', [xs], ([vs]) => { for (const v of vs) { if (v < 0) return; } return vs.length >= 0 })`,
      filename: FILENAME,
      errors: [{ messageId: 'bareReturn' }],
    },
    {
      name: 'Should_Report_When_BareReturnInsideForStatement',
      code:
        `it.prop('∀xs_X_=x', [xs], ([vs]) => { for (let i = 0; i < vs.length; i++) { if (i < 0) return; } return vs.length >= 0 })`,
      filename: FILENAME,
      errors: [{ messageId: 'bareReturn' }],
    },
    {
      name: 'Should_Report_When_BareReturnInsideForInStatement',
      code: `it.prop('∀o_X_=x', [obj], ([o]) => { for (const k in o) { if (k === 'x') return; } return o !== null })`,
      filename: FILENAME,
      errors: [{ messageId: 'bareReturn' }],
    },
    {
      name: 'Should_Report_When_BareReturnInsideWhileStatement',
      code: `it.prop('∀n_X_=x', [n], ([v]) => { while (v < 0) { return; } return v >= 0 })`,
      filename: FILENAME,
      errors: [{ messageId: 'bareReturn' }],
    },
    {
      name: 'Should_Report_When_BareReturnInsideDoWhileStatement',
      code: `it.prop('∀n_X_=x', [n], ([v]) => { do { if (v < 0) return; } while (v > 0); return v >= 0 })`,
      filename: FILENAME,
      errors: [{ messageId: 'bareReturn' }],
    },
    {
      name: 'Should_Report_When_BareReturnInsideLabeledStatement',
      code: `it.prop('∀n_X_=x', [n], ([v]) => { outer: { if (v < 0) return; } return v >= 0 })`,
      filename: FILENAME,
      errors: [{ messageId: 'bareReturn' }],
    },
    {
      name: 'Should_Report_When_BareReturnInsideSwitchCase',
      code: `it.prop('∀v_X_=x', [n], ([v]) => { switch (v) { case 0: return; default: return true } })`,
      filename: FILENAME,
      errors: [{ messageId: 'bareReturn' }],
    },
    {
      name: 'Should_Report_When_BareReturnInGeneratorDeclaration',
      code:
        `it.effect.prop('∀x_X_=x', [a], ([x]) => { function* gen() { if (x === null) return; return x !== null } return Effect.gen(gen) })`,
      filename: FILENAME,
      errors: [{ messageId: 'bareReturn' }],
    },
    {
      name: 'Should_Report_When_ExpressionBodyTypeof',
      code: `it.prop('∀x_X_=x', [a], ([x]) => typeof x)`,
      filename: FILENAME,
      errors: [{ messageId: 'nonBooleanBody' }],
    },
    {
      name: 'Should_Report_When_TryExitsButCatchFalls',
      code: `it.prop('∀v_X_=x', [n], ([v]) => { try { return true } catch { cleanup() } })`,
      filename: FILENAME,
      errors: [{ messageId: 'missingReturn' }],
    },
    {
      name: 'Should_Report_When_BareReturnInFunctionExpressionPredicate',
      code: `it.prop('∀x_X_=x', [a], function ([x]) { return; })`,
      filename: FILENAME,
      errors: [{ messageId: 'bareReturn' }],
    },
  ],
})
