import { vitestFork } from '@systemfsoftware/vitest/plugin'
import { defaultClientConditions, defaultServerConditions } from 'vite'
import { configDefaults, defineConfig } from 'vitest/config'

import { recursionBudgetTransform } from './src/recursion-budget-transform.js'

export default defineConfig({
  plugins: [recursionBudgetTransform(), vitestFork()],
  resolve: { conditions: ['@systemfsoftware/source', ...defaultClientConditions] },
  ssr: { resolve: { conditions: ['@systemfsoftware/source', ...defaultServerConditions] } },
  test: {
    include: ['tests/**/*.test.ts'],
    includeSource: ['src/**/*.{js,ts}'],
    exclude: [...configDefaults.exclude, '**/.stryker-tmp/**'],
    setupFiles: ['@systemfsoftware/vitest/guard'],
    passWithNoTests: true,
    testTimeout: 30_000,
    silent: 'passed-only',
  },
})
