import type { OxlintConfig } from 'oxlint'

// No runtime imports: the oxlint-plugin family lint root loads this module
// from source, so it must stay loadable without any workspace build.
export const ruleAuthoring: OxlintConfig = {
  options: {
    typeAware: true,
  },
  categories: {
    correctness: 'error',
  },
  plugins: ['typescript', 'import', 'jsdoc', 'node', 'promise', 'vitest', 'unicorn', 'oxc'],
  rules: {
    'vitest/no-standalone-expect': 'off',
    'typescript/ban-ts-comment': 'error',
    'typescript/consistent-type-assertions': [
      'error',
      {
        assertionStyle: 'never',
      },
    ],
    'typescript/no-explicit-any': 'error',
    'typescript/no-non-null-assertion': 'error',
  },
  overrides: [
    {
      files: ['**/__tests__/**', '**/*.test.ts'],
      rules: {
        'typescript/consistent-type-assertions': 'off',
      },
    },
  ],
}
