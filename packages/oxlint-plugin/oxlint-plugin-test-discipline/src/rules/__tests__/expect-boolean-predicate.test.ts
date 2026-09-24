import {
  VIOLATION_ACTUAL,
  VIOLATION_EXPECTED,
  VIOLATION_FIX,
  VIOLATION_NAME,
} from '../expect-boolean-predicate.config.js'
import { expectBooleanPredicate } from '../expect-boolean-predicate.js'
import { createRuleTester } from './_tester.js'

const ruleTester = createRuleTester()

const EXPECTED_DATA = {
  name: VIOLATION_NAME,
  expected: VIOLATION_EXPECTED,
  actual: VIOLATION_ACTUAL,
  fix: VIOLATION_FIX,
}

ruleTester.run('expect-boolean-predicate', expectBooleanPredicate, {
  valid: [
    {
      name: 'Should_Allow_MemberRead_When_AssertedFalse',
      code: `expect(s.acquired).toBe(false)`,
    },
    {
      name: 'Should_Allow_IdentifierRead_When_AssertedTrue',
      code: `expect(ready).toBe(true)`,
    },
    {
      name: 'Should_Allow_NonBooleanMatcherArgument_When_SubjectIsACall',
      code: `expect(fn()).toBe(3)`,
    },
    {
      name: 'Should_Allow_BooleanLiteralSubject_When_AssertedTrue',
      code: `expect(true).toBe(true)`,
    },
    {
      name: 'Should_Allow_NonBooleanMatcher_When_SubjectIsAPredicateCall',
      code: `expect(Result.isFailure(x)).toBe(1)`,
    },
    {
      name: 'Should_Allow_PredicateCall_When_AssertedThroughResolves',
      code: `await expect(check(x)).resolves.toBe(true)`,
    },
    {
      name: 'Should_Allow_NonExpectReceiver_When_AssertedTrue',
      code: `assert(isValid(x)).toBe(true)`,
    },
  ],
  invalid: [
    {
      name: 'Should_Report_PredicateCall_When_AssertedTrue',
      code: `expect(Result.isFailure(s.reading)).toBe(true)`,
      errors: [{ messageId: 'booleanPredicate', data: EXPECTED_DATA }],
    },
    {
      name: 'Should_Report_Comparison_When_AssertedTrue',
      code: `expect(a === b).toBe(true)`,
      errors: [{ messageId: 'booleanPredicate', data: EXPECTED_DATA }],
    },
    {
      name: 'Should_Report_Negation_When_AssertedFalse',
      code: `expect(!ok).toBe(false)`,
      errors: [{ messageId: 'booleanPredicate', data: EXPECTED_DATA }],
    },
    {
      name: 'Should_Report_MethodCall_When_AssertedToEqualTrue',
      code: `expect(xs.includes(y)).toEqual(true)`,
      errors: [{ messageId: 'booleanPredicate', data: EXPECTED_DATA }],
    },
    {
      name: 'Should_Report_ThroughNot_When_SubjectIsAPredicateCall',
      code: `expect(Result.isFailure(x)).not.toBe(false)`,
      errors: [{ messageId: 'booleanPredicate', data: EXPECTED_DATA }],
    },
    {
      name: 'Should_Report_LogicalAnd_When_AssertedTrue',
      code: `expect(isValid(a) && isReady(b)).toBe(true)`,
      errors: [{ messageId: 'booleanPredicate', data: EXPECTED_DATA }],
    },
    {
      name: 'Should_Report_LogicalOr_When_AssertedFalse',
      code: `expect(isValid(a) || isReady(b)).toBe(false)`,
      errors: [{ messageId: 'booleanPredicate', data: EXPECTED_DATA }],
    },
    {
      name: 'Should_Report_Instanceof_When_AssertedTrue',
      code: `expect(x instanceof Error).toBe(true)`,
      errors: [{ messageId: 'booleanPredicate', data: EXPECTED_DATA }],
    },
    {
      name: 'Should_Report_InOperator_When_AssertedTrue',
      code: `expect('key' in record).toEqual(true)`,
      errors: [{ messageId: 'booleanPredicate', data: EXPECTED_DATA }],
    },
    {
      name: 'Should_Report_RelationalComparison_When_AssertedFalse',
      code: `expect(count >= limit).toBe(false)`,
      errors: [{ messageId: 'booleanPredicate', data: EXPECTED_DATA }],
    },
  ],
})
