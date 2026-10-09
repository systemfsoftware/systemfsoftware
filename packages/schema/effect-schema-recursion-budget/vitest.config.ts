import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'

import { recursionBudgetTransform } from './src/recursion-budget-transform.js'

export default defineConfig({
  ...sharedConfig,
  plugins: [recursionBudgetTransform()],
  test: {
    ...sharedConfig.test,
    include: ['tests/**/*.test.ts'],
    includeSource: ['src/**/*.{js,ts}'],
    testTimeout: 30_000,
  },
})
