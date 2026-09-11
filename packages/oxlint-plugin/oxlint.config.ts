import { defineConfig } from 'oxlint'

export default defineConfig({
  categories: {
    correctness: 'error',
  },

  plugins: ['typescript', 'import', 'jsdoc', 'node', 'promise', 'vitest', 'unicorn', 'oxc'],

  rules: {
    'vitest/no-standalone-expect': 'off',
    'typescript/ban-ts-comment': 'error',
    'typescript/consistent-type-assertions': ['error', {
      assertionStyle: 'never',
    }],
    'typescript/no-explicit-any': 'error',
    'typescript/no-non-null-assertion': 'error',
  },

  ignorePatterns: [
    '**/node_modules/**',
    '**/dist/**',
    '**/lib/**',
    '**/build/**',
    '**/.turbo/**',
    '**/coverage/**',
    '**/*.d.ts',
    '**/*.tsbuildinfo',
    '**/.claude/**',
    '**/.opencode/**',
    '**/.sisyphus/**',
  ],

  overrides: [
    {
      files: ['oxlint-plugin-test-placement/src/rules/__tests__/_guards.test.ts'],
      rules: {
        'typescript/consistent-type-assertions': 'off',
      },
    },
  ],
})
