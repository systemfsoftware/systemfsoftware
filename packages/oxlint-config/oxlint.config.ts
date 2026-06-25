import { defineConfig } from 'oxlint'

/**
 * Self-contained config for the oxlint-config package itself.
 * This avoids circular dependency by not extending from @systemfsoftware/oxlint-config/base.
 */
export default defineConfig({
  categories: {
    correctness: 'error',
  },

  plugins: ['typescript', 'import', 'jsdoc', 'node', 'promise', 'vitest', 'unicorn'],

  rules: {
    'no-console': 'off',
    'no-debugger': 'off',
    'typescript/no-unnecessary-boolean-literal-compare': 'off',
    'jest/no-standalone-expect': 'off',
    'jest/valid-expect': 'off',
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
