import { recursionBudgetTransform } from '@systemfsoftware/effect-schema-recursion-budget'
import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'

export default defineConfig({
  ...sharedConfig,
  plugins: [recursionBudgetTransform()],
  test: {
    ...sharedConfig.test,
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
  },
})
