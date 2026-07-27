import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { noAssertInProperty } from '../no-assert-in-property.js'

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

ruleTester.run('no-assert-in-property', noAssertInProperty, {
  valid: [
    {
      name: 'Should_Pass_When_ExpectOutsideProperty',
      code: `it('plain test', () => { expect(1).toBe(1) })`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_AssertStarOutsideProperty',
      code: `it.effect('plain effect test', () => Effect.gen(function*() { assertSome(opt) }))`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_BooleanReturnInProp',
      code: `it.prop('∀n_X_=x', [fc.integer()], ([n]) => n === n)`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_FcPreInsideProp',
      code: `it.prop('→Pos_X_<1', [fc.integer()], ([n]) => { fc.pre(n > 0); return 1 / n < 1 })`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_FcBuildersInArbitraries',
      code: `it.prop('∀h_X_=x', [fc.stringMatching(/^0x[0-9a-f]+$/)], ([h]) => check(h))`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_AssertNamedVariableNotCalled',
      code: `it.prop('∀n_X_=x', [fc.integer()], ([n]) => { const assertEqual = n === n; return assertEqual })`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_IdentifierContainingAssertNotAtStart',
      code: `it.prop('∀n_X_=x', [fc.integer()], ([n]) => { xassert(n); return n === n })`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_ExpectInArbitrariesPosition',
      code: `it.prop('x', [expect(1)], 'no-predicate')`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_CheckMethodOnNonFcObject',
      code: `it.prop('∀x_X_=x', [a], ([x]) => { xs.check(x); return x === x })`,
      filename: FILENAME,
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_ExpectInsideProp',
      code: `it.prop('∀xs_Rev_=xs', [fc.array(fc.integer())], ([xs]) => { expect(xs).toEqual(xs); return true })`,
      filename: FILENAME,
      errors: [
        {
          messageId: 'expectCall',
          data: {
            name: 'expect(...) inside a property predicate',
            expected: 'return <boolean> — the boolean return IS the verdict in it.prop / it.effect.prop',
            actual: 'expect(...) forks the failure channel (throw vs false)',
            fix:
              'compute the value, then return a single boolean expression; assert* stays correct in normal (non-property) tests',
          },
        },
      ],
    },
    {
      name: 'Should_Report_When_AssertSomeInsideProp',
      code: `it.prop('∀o_X_∈Some', [arb], ([o]) => { assertSome(o); return true })`,
      filename: FILENAME,
      errors: [
        {
          messageId: 'assertCall',
          data: {
            name: 'assertSome(...) inside a property predicate',
            expected: 'return <boolean> — the boolean return IS the verdict in it.prop / it.effect.prop',
            actual: 'assertSome(...) forks the failure channel (throw vs false)',
            fix:
              'compute the value, then return a single boolean expression; assert* stays correct in normal (non-property) tests',
          },
        },
      ],
    },
    {
      name: 'Should_Report_When_AssertMemberInsideProp',
      code: `it.prop('∀n_X_=x', [fc.integer()], ([n]) => { assert.strictEqual(n, n); return true })`,
      filename: FILENAME,
      errors: [
        {
          messageId: 'assertCall',
          data: {
            name: 'assert.strictEqual(...) inside a property predicate',
            expected: 'return <boolean> — the boolean return IS the verdict in it.prop / it.effect.prop',
            actual: 'assert.strictEqual(...) forks the failure channel (throw vs false)',
            fix:
              'compute the value, then return a single boolean expression; assert* stays correct in normal (non-property) tests',
          },
        },
      ],
    },
    {
      name: 'Should_Report_When_ExpectInsideEffectPropGenerator',
      code:
        `it.effect.prop('∀x_X_=x', [arb], ([x]) => Effect.gen(function*() { const y = yield* load(x); expect(y).toEqual(x); return y === x }))`,
      filename: FILENAME,
      errors: [{ messageId: 'expectCall' }],
    },
    {
      name: 'Should_Report_When_ExpectInsideNestedCallback',
      code:
        `it.prop('∀xs_X_=x', [fc.array(fc.integer())], ([xs]) => { xs.forEach((x) => { expect(x).toBe(x) }); return xs.length >= 0 })`,
      filename: FILENAME,
      errors: [{ messageId: 'expectCall' }],
    },
    {
      name: 'Should_Report_When_FcAssertInsideProp',
      code:
        `it.prop('∀n_X_=x', [fc.integer()], ([n]) => { fc.assert(fc.property(fc.integer(), (m) => m === m)); return n === n })`,
      filename: FILENAME,
      errors: [
        {
          messageId: 'rawFcRun',
          data: {
            name: 'fc.assert(...) inside a property predicate',
            expected: 'return <boolean> — the boolean return IS the verdict in it.prop / it.effect.prop',
            actual: 'fc.assert(...) forks the failure channel (throw vs false)',
            fix:
              'compute the value, then return a single boolean expression; assert* stays correct in normal (non-property) tests',
          },
        },
      ],
    },
    {
      name: 'Should_Report_When_FcCheckInsideProp',
      code:
        `it.prop('∀n_X_=x', [fc.integer()], ([n]) => { fc.check(fc.property(fc.integer(), (m) => m === m)); return n === n })`,
      filename: FILENAME,
      errors: [{ messageId: 'rawFcRun' }],
    },
    {
      name: 'Should_Report_When_ExpectInsidePropOnly',
      code: `it.prop.only('∀n_X_=x', [fc.integer()], ([n]) => { expect(n).toBe(n); return true })`,
      filename: FILENAME,
      errors: [{ messageId: 'expectCall' }],
    },
    {
      name: 'Should_Report_When_ExpectInsideFunctionExpressionPredicate',
      code: `it.prop('∀x_X_=x', [a], function ([x]) { expect(x).toBe(x); return true })`,
      filename: FILENAME,
      errors: [{ messageId: 'expectCall' }],
    },
    {
      name: 'Should_Report_When_ExpectInsideConstAssignedCallback',
      code: `it.prop('∀x_X_=x', [a], ([x]) => { const f = () => { expect(x).toBe(x) }; f(); return true })`,
      filename: FILENAME,
      errors: [{ messageId: 'expectCall' }],
    },
    {
      name: 'Should_Report_When_ExpectInsidePropTodo',
      code: `it.prop.todo('∀n_X_=x', [fc.integer()], ([n]) => { expect(n).toBe(n); return true })`,
      filename: FILENAME,
      errors: [{ messageId: 'expectCall' }],
    },
  ],
})
