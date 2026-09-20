import type { OxlintConfig, OxlintOverride } from 'oxlint'

const OBSERVER_FILES = ['**/*.test.ts', '**/tests/**', '**/__tests__/**'] as const

const SOURCE_AND_TEST_FILES = ['**/src/**', '**/*.test.ts'] as const

/** @public */
export const plugins = ['typescript', 'import', 'unicorn', 'vitest'] as const

/** @public */
export const options = { typeAware: true } as const

/** @public */
export const rules: NonNullable<OxlintConfig['rules']> = {
  'vitest/no-standalone-expect': 'off',
  'no-ternary': 'error',
  'typescript/no-explicit-any': 'error',
  'typescript/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
  'typescript/no-unsafe-argument': 'error',
  'typescript/no-unsafe-assignment': 'error',
  'typescript/no-unsafe-call': 'error',
  'typescript/no-unsafe-member-access': 'error',
  'typescript/no-unsafe-return': 'error',
  'typescript/no-non-null-assertion': 'error',
  'typescript/ban-ts-comment': [
    'error',
    {
      'ts-expect-error': 'allow-with-description',
      'ts-ignore': true,
      'ts-nocheck': true,
      'ts-check': false,
      minimumDescriptionLength: 10,
    },
  ],
  'unicorn/no-abusive-eslint-disable': 'error',
  'typescript/no-floating-promises': 'error',
  'typescript/no-misused-promises': 'error',
  'typescript/await-thenable': 'error',
  'typescript/only-throw-error': 'error',
  'no-throw-literal': 'error',
  'typescript/no-unnecessary-condition': 'error',
  'typescript/strict-boolean-expressions': 'error',
  'typescript/no-unnecessary-type-assertion': 'error',
  'typescript/switch-exhaustiveness-check': [
    'error',
    { allowDefaultCaseForExhaustiveSwitch: false, considerDefaultExhaustiveForUnions: false },
  ],
  'typescript/no-base-to-string': 'error',
  'import/no-cycle': 'error',
  'import/no-mutable-exports': 'error',
  'no-var': 'error',
}
/** @public */
export const overrides: OxlintOverride[] = [
  {
    files: [...SOURCE_AND_TEST_FILES],
    rules: { ...rules },
  },
  {
    files: [...OBSERVER_FILES],
    rules: {
      'vitest/expect-expect': 'error',
      'vitest/valid-expect': 'error',
      'vitest/no-conditional-in-test': 'error',
      'vitest/no-focused-tests': 'error',
      'vitest/no-disabled-tests': 'error',
      'vitest/no-identical-title': 'error',
    },
  },
]

/** @public */
const recommended: OxlintConfig = {
  plugins: [...plugins],
  options: { ...options },
  categories: { correctness: 'error' },
  overrides: [...overrides],
}

export default recommended
