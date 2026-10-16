export const SHOULD_PREFIX_LENGTH = 7
export const WHEN_SEPARATOR_LENGTH = 6

export const PASCAL_CASE = /^[A-Z][a-z][a-zA-Z0-9]*$/

export const RECOGNIZED_TEST_METHODS = new Set(['only', 'effect'])

export const TEST_PREFIX_FORBIDDEN_EXPECTED = 'DAMP format starting with Should_'
export const MISSING_SHOULD_PREFIX_EXPECTED = 'Test name starting with Should_'
export const MISSING_WHEN_SEPARATOR_EXPECTED = 'Should_[Behavior]_When_[Condition] format'
export const EMPTY_BEHAVIOR_EXPECTED = 'Non-empty behavior in PascalCase (e.g., ThrowError)'
export const EMPTY_CONDITION_EXPECTED = 'Non-empty condition in PascalCase (e.g., PasswordInvalid)'
export const INVALID_BEHAVIOR_CASE_EXPECTED = 'PascalCase (e.g., ThrowError)'
export const INVALID_CONDITION_CASE_EXPECTED = 'PascalCase (e.g., PasswordInvalid)'

export const TEST_PREFIX_FORBIDDEN_FIX = 'Remove "test" prefix and use DAMP format: Should_[Behavior]_When_[Condition]'
export const MISSING_SHOULD_PREFIX_FIX = 'Add "Should_" prefix to test name'
export const MISSING_WHEN_SEPARATOR_FIX = 'Insert "_When_" separator between behavior and condition'
export const EMPTY_BEHAVIOR_FIX =
  'Add descriptive behavior between Should_ and _When_ (e.g., Should_ThrowError_When_Called)'
export const EMPTY_CONDITION_FIX =
  'Add descriptive condition after _When_ (e.g., Should_ThrowError_When_PasswordInvalid)'
export const INVALID_BEHAVIOR_CASE_FIX = 'Convert behavior to PascalCase (e.g., throwError → ThrowError)'
export const INVALID_CONDITION_CASE_FIX = 'Convert condition to PascalCase (e.g., passwordInvalid → PasswordInvalid)'

export const EMPTY_BEHAVIOR_ACTUAL = 'Empty string between Should_ and _When_'
export const EMPTY_CONDITION_ACTUAL = 'Empty string after _When_'

export const meta = {
  type: 'suggestion',
  docs: {
    description:
      'Enforce DAMP (Descriptive and Meaningful Phrases) test naming format: Should_[ExpectedBehavior]_When_[Condition]',
  },
  schema: [],
  messages: {
    testPrefixForbidden: '{{expected}}. Actual: {{actual}}. Fix: {{fix}}.',
    missingShouldPrefix: '{{expected}}. Actual: {{actual}}. Fix: {{fix}}.',
    missingWhenSeparator: '{{expected}}. Actual: {{actual}}. Fix: {{fix}}.',
    emptyBehavior: '{{expected}}. Actual: {{actual}}. Fix: {{fix}}.',
    emptyCondition: '{{expected}}. Actual: {{actual}}. Fix: {{fix}}.',
    invalidBehaviorCase: '{{expected}}. Actual: {{actual}}. Fix: {{fix}}.',
    invalidConditionCase: '{{expected}}. Actual: {{actual}}. Fix: {{fix}}.',
  },
} as const
