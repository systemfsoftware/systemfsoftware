export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const NOT = 'not' as const

export const BOOLEAN_MATCHERS: Record<string, true> = { toBe: true, toEqual: true }

export const COMPARISON_OPERATORS: Record<string, true> = {
  '===': true,
  '!==': true,
  '==': true,
  '!=': true,
  '<': true,
  '<=': true,
  '>': true,
  '>=': true,
  instanceof: true,
  in: true,
}

export const VIOLATION_NAME = 'a predicate evaluated in the test asserted against true or false' as const
export const VIOLATION_EXPECTED = 'expect(...) around a boolean the code under test returned' as const

export const VIOLATION_ACTUAL =
  'expect(...) wraps a call, a comparison, a `!` or an `&&` / `||` evaluated in the test, so a failure reports `expected false to be true` instead of the values that disagreed' as const

export const VIOLATION_FIX =
  'rewrite a predicate call as expect(x).toSatisfy(P) — e.g. expect(s.reading).toSatisfy(Result.isFailure) — and a comparison as expect(a).toEqual(b)' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'An expect(...) asserted with toBe(true|false) or toEqual(true|false) must wrap a boolean the code under test returned. A predicate call, comparison, negation or && / || evaluated in the test is refused, with the toSatisfy or toEqual rewrite as the fix.',
  },
  schema: [],
  messages: {
    booleanPredicate: MESSAGE,
  },
} as const
