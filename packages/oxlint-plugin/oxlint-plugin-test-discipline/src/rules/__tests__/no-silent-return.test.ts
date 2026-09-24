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
      code: `it.prop('∀n_X_=x', { of: [fc.integer()], subject: (n) => n, runs: 100 }, (s, [v]) => v === v)`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_ExpressionBodyIsCall',
      code: `it.prop('∀s_X_∈Valid', { of: [fc.string()], subject: (s) => s, runs: 100 }, (s, [v]) => isValid(v))`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_ExpressionBodyIsIdentifier',
      code: `it.prop('∀s_X_∈Valid', { of: [fc.string()], subject: (s) => s, runs: 100 }, (s, [v]) => verdict)`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_BlockEndsWithBooleanReturn',
      code:
        `it.prop('∀n_X_=x', { of: [fc.integer()], subject: (n) => n, runs: 100 }, (s, [v]) => { const d = v * 2; return d === v + v })`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_IfElseBothReturn',
      code:
        `it.prop('∀n_X_=x', { of: [fc.integer()], subject: (n) => n, runs: 100 }, (s, [v]) => { if (v > 0) { return v > 0 } else { return v <= 0 } })`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_ThrowExitsBeforeReturn',
      code:
        `it.prop('∀n_X_=x', { of: [fc.integer()], subject: (n) => n, runs: 100 }, (s, [v]) => { if (v === 0) throw new Error('zero'); return v !== 0 })`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_SwitchAllCasesReturnWithDefault',
      code:
        `it.prop('∀n_X_=x', { of: [fc.integer()], subject: (n) => n, runs: 100 }, (s, [v]) => { switch (v) { case 0: return true; default: return v !== 0 } })`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_TryCatchBothReturn',
      code:
        `it.prop('∀s_X_=x', { of: [fc.string()], subject: (s) => s, runs: 100 }, (s, [v]) => { try { return parse(v) === v } catch { return false } })`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_ConditionalExpression',
      code:
        `it.prop('≤ab_Sort_≤Out', { of: [fc.integer(), fc.integer()], subject: (a) => a, runs: 100 }, (s, [a, b]) => a <= b ? true : check(b))`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_LogicalAndOfCalls',
      code:
        `it.prop('∀r_X_=x', { of: [arb], subject: (r) => r, runs: 100 }, (s, [v]) => isRight(v) && eq(v.right, v.left))`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_IdentifierReturnTrusted',
      code:
        `it.prop('∀n_X_=x', { of: [fc.integer()], subject: (n) => n, runs: 100 }, (s, [v]) => { const verdict = v === v; return verdict })`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_NonGeneratorNestedFunctionBareReturn',
      code:
        `it.prop('∀xs_X_=x', { of: [fc.array(fc.integer())], subject: (xs) => xs, runs: 100 }, (s, [v]) => { v.forEach((x) => { return; }); return v.length >= 0 })`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_EffectPropGeneratorReturnsBoolean',
      code:
        `it.effect.prop('∀x_X_=x', { of: [arb], subject: (x) => x, runs: 100 }, (s, [v]) => Effect.gen(function*() { const y = yield* load(v); return y === v }))`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_PropOnlyModifier',
      code: `it.prop.only('∀n_X_=x', { of: [fc.integer()], subject: (n) => n, runs: 100 }, (s, [v]) => v === v)`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_NotAPropCall',
      code: `it('plain test', () => { const x = 1 })`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_TSTypeAssertionOfComparison',
      code:
        `it.prop('∀n_X_=x', { of: [fc.integer()], subject: (n) => n, runs: 100 }, (s, [v]) => (v === v) as boolean)`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_LooseEqualityOperator',
      code: `it.prop('∀ab_X_=x', { of: [a, b], subject: (x) => x, runs: 100 }, (s, [x, y]) => x == y)`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_LooseInequalityOperator',
      code: `it.prop('∀ab_X_=x', { of: [a, b], subject: (x) => x, runs: 100 }, (s, [x, y]) => x != y)`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_InstanceofOperator',
      code: `it.prop('∀x_X_∈Error', { of: [a], subject: (x) => x, runs: 100 }, (s, [v]) => v instanceof Error)`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_InOperator',
      code: `it.prop('∀x_K_∈x', { of: [a], subject: (x) => x, runs: 100 }, (s, [v]) => 'k' in v)`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_OptionalChainingCall',
      code: `it.prop('∀xs_X_≥0', { of: [xs], subject: (vs) => vs, runs: 100 }, (s, [v]) => v?.every((x) => x > 0))`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_NegationOfCall',
      code: `it.prop('∀x_¬Valid_⊥', { of: [x], subject: (v) => v, runs: 100 }, (s, [v]) => !isValid(v))`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_AngleBracketAssertion',
      code: `it.prop('∀n_X_=x', { of: [n], subject: (v) => v, runs: 100 }, (s, [v]) => <boolean>(v === v))`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_PropOnNonItObject',
      code: `foo.prop('x', { of: [a], subject: (x) => x, runs: 100 }, (s, [v]) => { return; })`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_EffectLikeNonEffectMember',
      code: `it.effectX.prop('x', { of: [a], subject: (x) => x, runs: 100 }, (s, [v]) => { return; })`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_EffectPropOnNonItObject',
      code: `foo.effect.prop('x', { of: [a], subject: (x) => x, runs: 100 }, (s, [v]) => { return; })`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_NonModifierAfterProp',
      code: `it.prop.foo('x', { of: [a], subject: (x) => x, runs: 100 }, (s, [v]) => { return; })`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_BarePropIdentifierCallee',
      code: `prop('x', { of: [a], subject: (x) => x, runs: 100 }, (s, [v]) => { return; })`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_ComputedPropAccess',
      code: `it['prop']('x', { of: [a], subject: (x) => x, runs: 100 }, (s, [v]) => { return; })`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_NoPredicateArgument',
      code: `it.prop('x', { of: [arb], subject: (x) => x, runs: 100 })`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_NestedFunctionExpressionBareReturn',
      code:
        `it.prop('x', { of: [xs], subject: (vs) => vs, runs: 100 }, (s, [v]) => { v.forEach(function () { return; }); return v.length >= 0 })`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_GeneratorInsideNestedArrow',
      code:
        `it.prop('x', { of: [a], subject: (x) => x, runs: 100 }, (s, [v]) => { const f = () => Effect.gen(function* () { return; }); return v === v })`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_NonGeneratorFunctionDeclarationBareReturn',
      code:
        `it.prop('x', { of: [a], subject: (x) => x, runs: 100 }, (s, [v]) => { function helper() { return; } helper(); return v === v })`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_SatisfiesOfComparison',
      code: `it.prop('∀n_X_=x', { of: [n], subject: (v) => v, runs: 100 }, (s, [v]) => (v === v) satisfies boolean)`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_NonNullAssertionOfCall',
      code: `it.prop('∀x_X_∈Valid', { of: [x], subject: (v) => v, runs: 100 }, (s, [v]) => check(v)!)`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_AwaitedCall',
      code: `it.prop('∀x_X_∈Valid', { of: [x], subject: (v) => v, runs: 100 }, async (s, [v]) => await check(v))`,
      filename: FILENAME,
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_BareReturn',
      code:
        `it.prop('→Positive_X_<1', { of: [fc.integer()], subject: (n) => n, runs: 100 }, (s, [v]) => { if (v <= 0) return; return 1 / v < 1 })`,
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
      code:
        `it.prop('∀n_X_=x', { of: [fc.integer()], subject: (n) => n, runs: 100 }, (s, [v]) => { const d = v * 2; v === v + v })`,
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
      code: `it.prop('∀n_X_=x', { of: [fc.integer()], subject: (n) => n, runs: 100 }, (s, [v]) => { return 42 })`,
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
      code: `it.prop('∀n_X_=x', { of: [fc.integer()], subject: (n) => n, runs: 100 }, (s, [v]) => { return v + 1 })`,
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
      code:
        `it.prop('∀n_X_=x', { of: [fc.integer()], subject: (n) => n, runs: 100 }, (s, [v]) => { if (v > 0) return v === v })`,
      filename: FILENAME,
      errors: [{ messageId: 'missingReturn' }],
    },
    {
      name: 'Should_Report_When_ExpressionBodyArithmetic',
      code: `it.prop('∀n_X_=x', { of: [fc.integer()], subject: (n) => n, runs: 100 }, (s, [v]) => v + 1)`,
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
      code: `it.prop('∀a_X_=x', { of: [arb], subject: (a) => a, runs: 100 }, (s, [v]) => v ?? true)`,
      filename: FILENAME,
      errors: [{ messageId: 'nonBooleanBody' }],
    },
    {
      name: 'Should_Report_When_ReturnNullishCoalescing',
      code: `it.prop('∀a_X_=x', { of: [arb], subject: (a) => a, runs: 100 }, (s, [v]) => { return v ?? true })`,
      filename: FILENAME,
      errors: [{ messageId: 'nonBooleanReturn' }],
    },
    {
      name: 'Should_Report_When_EffectPropGeneratorFallsOff',
      code:
        `it.effect.prop('∀x_X_=x', { of: [arb], subject: (x) => x, runs: 100 }, (s, [v]) => Effect.gen(function*() { const y = yield* load(v); y === v }))`,
      filename: FILENAME,
      errors: [{ messageId: 'missingReturn' }],
    },
    {
      name: 'Should_Report_When_EffectPropGeneratorBareReturn',
      code:
        `it.effect.prop('∀x_X_=x', { of: [arb], subject: (x) => x, runs: 100 }, (s, [v]) => Effect.gen(function*() { if (v === null) return; return v !== null }))`,
      filename: FILENAME,
      errors: [{ messageId: 'bareReturn' }],
    },
    {
      name: 'Should_Report_When_SwitchMissingDefault',
      code:
        `it.prop('∀n_X_=x', { of: [fc.integer()], subject: (n) => n, runs: 100 }, (s, [v]) => { switch (v) { case 0: return true; case 1: return false } })`,
      filename: FILENAME,
      errors: [{ messageId: 'missingReturn' }],
    },
    {
      name: 'Should_Report_When_PropSkipModifierBareReturn',
      code:
        `it.prop.skip('∀n_X_=x', { of: [fc.integer()], subject: (n) => n, runs: 100 }, (s, [v]) => { if (v <= 0) return; return v > 0 })`,
      filename: FILENAME,
      errors: [{ messageId: 'bareReturn' }],
    },
    {
      name: 'Should_Report_When_TryWithoutCatchFalls',
      code:
        `it.prop('∀s_X_=x', { of: [fc.string()], subject: (s) => s, runs: 100 }, (s, [v]) => { try { parse(v) } finally { cleanup() } })`,
      filename: FILENAME,
      errors: [{ messageId: 'missingReturn' }],
    },
    {
      name: 'Should_Report_When_ConditionalAlternateNonBoolean',
      code: `it.prop('∀x_X_=x', { of: [a], subject: (x) => x, runs: 100 }, (s, [v]) => v > 0 ? check(v) : v + 1)`,
      filename: FILENAME,
      errors: [{ messageId: 'nonBooleanBody' }],
    },
    {
      name: 'Should_Report_When_BareReturnInElse',
      code:
        `it.prop('∀v_X_=x', { of: [n], subject: (v) => v, runs: 100 }, (s, [v]) => { if (v > 0) { return true } else { return; } })`,
      filename: FILENAME,
      errors: [{ messageId: 'bareReturn' }],
    },
    {
      name: 'Should_Report_When_BareReturnInTry',
      code:
        `it.prop('∀v_X_=x', { of: [n], subject: (v) => v, runs: 100 }, (s, [v]) => { try { return; } catch { return true } })`,
      filename: FILENAME,
      errors: [{ messageId: 'bareReturn' }],
    },
    {
      name: 'Should_Report_When_BareReturnInCatch',
      code:
        `it.prop('∀v_X_=x', { of: [n], subject: (v) => v, runs: 100 }, (s, [v]) => { try { return true } catch { return; } })`,
      filename: FILENAME,
      errors: [{ messageId: 'bareReturn' }],
    },
    {
      name: 'Should_Report_When_BareReturnInFinally',
      code:
        `it.prop('∀v_X_=x', { of: [n], subject: (v) => v, runs: 100 }, (s, [v]) => { try { return true } finally { return; } })`,
      filename: FILENAME,
      errors: [{ messageId: 'bareReturn' }],
    },
    {
      name: 'Should_Report_When_SwitchDefaultFallsThrough',
      code:
        `it.prop('∀v_X_=x', { of: [n], subject: (v) => v, runs: 100 }, (s, [v]) => { switch (v) { case 0: return true; default: v } })`,
      filename: FILENAME,
      errors: [{ messageId: 'missingReturn' }],
    },
    {
      name: 'Should_Report_When_PropTodoModifierBareReturn',
      code:
        `it.prop.todo('∀v_X_=x', { of: [n], subject: (v) => v, runs: 100 }, (s, [v]) => { if (v <= 0) return; return v > 0 })`,
      filename: FILENAME,
      errors: [{ messageId: 'bareReturn' }],
    },
    {
      name: 'Should_Report_When_ExpressionBodyObjectLiteral',
      code: `it.prop('∀x_X_=x', { of: [a], subject: (x) => x, runs: 100 }, (s, [v]) => ({ a: v }))`,
      filename: FILENAME,
      errors: [{ messageId: 'nonBooleanBody' }],
    },
    {
      name: 'Should_Report_When_LogicalRightArithmetic',
      code: `it.prop('∀x_X_=x', { of: [a], subject: (x) => x, runs: 100 }, (s, [v]) => { return check(v) && v + 1 })`,
      filename: FILENAME,
      errors: [{ messageId: 'nonBooleanReturn' }],
    },
    {
      name: 'Should_Report_When_BareReturnInsideLoop',
      code:
        `it.prop('∀xs_X_=x', { of: [xs], subject: (vs) => vs, runs: 100 }, (s, [v]) => { for (const x of v) { if (x < 0) return; } return v.length >= 0 })`,
      filename: FILENAME,
      errors: [{ messageId: 'bareReturn' }],
    },
    {
      name: 'Should_Report_When_BareReturnInsideForStatement',
      code:
        `it.prop('∀xs_X_=x', { of: [xs], subject: (vs) => vs, runs: 100 }, (s, [v]) => { for (let i = 0; i < v.length; i++) { if (i < 0) return; } return v.length >= 0 })`,
      filename: FILENAME,
      errors: [{ messageId: 'bareReturn' }],
    },
    {
      name: 'Should_Report_When_BareReturnInsideForInStatement',
      code:
        `it.prop('∀o_X_=x', { of: [obj], subject: (o) => o, runs: 100 }, (s, [v]) => { for (const k in v) { if (k === 'x') return; } return v !== null })`,
      filename: FILENAME,
      errors: [{ messageId: 'bareReturn' }],
    },
    {
      name: 'Should_Report_When_BareReturnInsideWhileStatement',
      code:
        `it.prop('∀n_X_=x', { of: [n], subject: (v) => v, runs: 100 }, (s, [v]) => { while (v < 0) { return; } return v >= 0 })`,
      filename: FILENAME,
      errors: [{ messageId: 'bareReturn' }],
    },
    {
      name: 'Should_Report_When_BareReturnInsideDoWhileStatement',
      code:
        `it.prop('∀n_X_=x', { of: [n], subject: (v) => v, runs: 100 }, (s, [v]) => { do { if (v < 0) return; } while (v > 0); return v >= 0 })`,
      filename: FILENAME,
      errors: [{ messageId: 'bareReturn' }],
    },
    {
      name: 'Should_Report_When_BareReturnInsideLabeledStatement',
      code:
        `it.prop('∀n_X_=x', { of: [n], subject: (v) => v, runs: 100 }, (s, [v]) => { outer: { if (v < 0) return; } return v >= 0 })`,
      filename: FILENAME,
      errors: [{ messageId: 'bareReturn' }],
    },
    {
      name: 'Should_Report_When_BareReturnInsideSwitchCase',
      code:
        `it.prop('∀v_X_=x', { of: [n], subject: (v) => v, runs: 100 }, (s, [v]) => { switch (v) { case 0: return; default: return true } })`,
      filename: FILENAME,
      errors: [{ messageId: 'bareReturn' }],
    },
    {
      name: 'Should_Report_When_BareReturnInGeneratorDeclaration',
      code:
        `it.effect.prop('∀x_X_=x', { of: [a], subject: (x) => x, runs: 100 }, (s, [v]) => { function* gen() { if (v === null) return; return v !== null } return Effect.gen(gen) })`,
      filename: FILENAME,
      errors: [{ messageId: 'bareReturn' }],
    },
    {
      name: 'Should_Report_When_ExpressionBodyTypeof',
      code: `it.prop('∀x_X_=x', { of: [a], subject: (x) => x, runs: 100 }, (s, [v]) => typeof v)`,
      filename: FILENAME,
      errors: [{ messageId: 'nonBooleanBody' }],
    },
    {
      name: 'Should_Report_When_TryExitsButCatchFalls',
      code:
        `it.prop('∀v_X_=x', { of: [n], subject: (v) => v, runs: 100 }, (s, [v]) => { try { return true } catch { cleanup() } })`,
      errors: [{ messageId: 'missingReturn' }],
    },
    {
      name: 'Should_Report_When_BareReturnInFunctionExpressionPredicate',
      code: `it.prop('∀x_X_=x', { of: [a], subject: (x) => x, runs: 100 }, function (s, [v]) { return; })`,
      filename: FILENAME,
      errors: [{ messageId: 'bareReturn' }],
    },
  ],
})
