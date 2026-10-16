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
      code: `it.prop('∀n_X_=x', { of: [fc.integer()], subject: (n) => n, runs: 100 }, (s, [v]) => v === v)`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_FcPreInsideProp',
      code:
        `it.prop('→Pos_X_<1', { of: [fc.integer()], subject: (n) => n, runs: 100 }, (s, [v]) => { fc.pre(v > 0); return 1 / v < 1 })`,
    },
    {
      name: 'Should_Pass_When_FcBuildersInArbitraries',
      code:
        `it.prop('∀h_X_=x', { of: [fc.stringMatching(/^0x[0-9a-f]+$/)], subject: (h) => h, runs: 100 }, (s, [v]) => check(v))`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_AssertNamedVariableNotCalled',
      code:
        `it.prop('∀n_X_=x', { of: [fc.integer()], subject: (n) => n, runs: 100 }, (s, [v]) => { const assertEqual = v === v; return assertEqual })`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_IdentifierContainingAssertNotAtStart',
      code:
        `it.prop('∀n_X_=x', { of: [fc.integer()], subject: (n) => n, runs: 100 }, (s, [v]) => { xassert(v); return v === v })`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_ExpectInArbitrariesPosition',
      code: `it.prop('x', { of: [expect(1)], subject: (x) => x, runs: 100 }, 'no-predicate')`,
      filename: FILENAME,
    },
    {
      name: 'Should_Pass_When_CheckMethodOnNonFcObject',
      code:
        `it.prop('∀x_X_=x', { of: [a], subject: (x) => x, runs: 100 }, (s, [v]) => { xs.check(v); return v === v })`,
      filename: FILENAME,
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_ExpectInsideProp',
      code:
        `it.prop('∀xs_Rev_=xs', { of: [fc.array(fc.integer())], subject: (xs) => xs, runs: 100 }, (s, [v]) => { expect(v).toEqual(v); return true })`,
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
      code:
        `it.prop('∀o_X_∈Some', { of: [arb], subject: (o) => o, runs: 100 }, (s, [v]) => { assertSome(v); return true })`,
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
      code:
        `it.prop('∀n_X_=x', { of: [fc.integer()], subject: (n) => n, runs: 100 }, (s, [v]) => { assert.strictEqual(v, v); return true })`,
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
        `it.effect.prop('∀x_X_=x', { of: [arb], subject: (x) => x, runs: 100 }, (s, [v]) => Effect.gen(function*() { const y = yield* load(v); expect(y).toEqual(v); return y === v }))`,
      filename: FILENAME,
      errors: [{ messageId: 'expectCall' }],
    },
    {
      name: 'Should_Report_When_ExpectInsideNestedCallback',
      code:
        `it.prop('∀xs_X_=x', { of: [fc.array(fc.integer())], subject: (xs) => xs, runs: 100 }, (s, [v]) => { v.forEach((x) => { expect(x).toBe(x) }); return v.length >= 0 })`,
      filename: FILENAME,
      errors: [{ messageId: 'expectCall' }],
    },
    {
      name: 'Should_Report_When_FcAssertInsideProp',
      code:
        `it.prop('∀n_X_=x', { of: [fc.integer()], subject: (n) => n, runs: 100 }, (s, [v]) => { fc.assert(fc.property(fc.integer(), (m) => m === m)); return v === v })`,
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
        `it.prop('∀n_X_=x', { of: [fc.integer()], subject: (n) => n, runs: 100 }, (s, [v]) => { fc.check(fc.property(fc.integer(), (m) => m === m)); return v === v })`,
      filename: FILENAME,
      errors: [{ messageId: 'rawFcRun' }],
    },
    {
      name: 'Should_Report_When_ExpectInsidePropOnly',
      code:
        `it.prop.only('∀n_X_=x', { of: [fc.integer()], subject: (n) => n, runs: 100 }, (s, [v]) => { expect(v).toBe(v); return true })`,
      filename: FILENAME,
      errors: [{ messageId: 'expectCall' }],
    },
    {
      name: 'Should_Report_When_ExpectInsideFunctionExpressionPredicate',
      code:
        `it.prop('∀x_X_=x', { of: [a], subject: (x) => x, runs: 100 }, function (s, [v]) { expect(v).toBe(v); return true })`,
      filename: FILENAME,
      errors: [{ messageId: 'expectCall' }],
    },
    {
      name: 'Should_Report_When_ExpectInsideConstAssignedCallback',
      code:
        `it.prop('∀x_X_=x', { of: [a], subject: (x) => x, runs: 100 }, (s, [v]) => { const f = () => { expect(v).toBe(v) }; f(); return true })`,
      filename: FILENAME,
      errors: [{ messageId: 'expectCall' }],
    },
    {
      name: 'Should_Report_When_ExpectInsidePropTodo',
      code:
        `it.prop.todo('∀n_X_=x', { of: [fc.integer()], subject: (n) => n, runs: 100 }, (s, [v]) => { expect(v).toBe(v); return true })`,
      filename: FILENAME,
      errors: [{ messageId: 'expectCall' }],
    },
  ],
})
