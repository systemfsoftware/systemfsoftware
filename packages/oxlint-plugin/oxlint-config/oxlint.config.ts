import { defineConfig } from 'oxlint'

export default defineConfig({
  categories: {
    correctness: 'error',
  },

  plugins: ['typescript', 'jsdoc', 'node', 'promise', 'vitest', 'unicorn'],

  rules: {
    'no-console': 'off',
    'no-debugger': 'off',
    'typescript/no-unnecessary-boolean-literal-compare': 'off',
    'jest/no-standalone-expect': 'off',
    'jest/valid-expect': 'off',
    'vitest/no-standalone-expect': 'off',
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
    '**/repos/**',
  ],
})
