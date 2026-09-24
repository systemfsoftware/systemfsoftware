import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'

const serverConditionsWithoutBundlerModule = ['node', 'development|production', '@systemfsoftware/source']
const nestedVitestRunBudgetMs = 60_000

export default defineConfig({
  ...sharedConfig,
  ssr: { resolve: { conditions: serverConditionsWithoutBundlerModule } },
  test: {
    ...sharedConfig.test,
    include: ['tests/**/*.test.ts'],
    includeSource: ['src/**/*.ts'],
    passWithNoTests: false,
    testTimeout: nestedVitestRunBudgetMs,
  },
})
