import { defineConfig } from 'vitest/config'

import { recursionBudgetTransform } from './src/recursion-budget-transform.js'

const isCI = typeof process.env['CI'] === 'string' && process.env['CI'].length > 0

export default defineConfig({
  plugins: [recursionBudgetTransform()],
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    includeSource: ['src/**/*.{js,ts}'],
    passWithNoTests: true,
    testTimeout: 30_000,
    coverage: { enabled: isCI, provider: 'v8' },
  },
})
