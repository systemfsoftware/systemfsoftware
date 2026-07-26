import { defineConfig } from 'oxlint'

export default defineConfig({
  categories: {
    correctness: 'error',
  },

  plugins: ['typescript', 'import', 'jsdoc', 'node', 'promise', 'vitest', 'unicorn'],

  rules: {
    'typescript/consistent-type-assertions': ['error', {
      assertionStyle: 'never',
    }],
    'typescript/no-explicit-any': 'error',
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
})
