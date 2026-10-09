import { defaultClientConditions, defaultServerConditions } from 'vite'
import { configDefaults, defineConfig } from 'vitest/config'

import { vitestFork } from '@systemfsoftware/vitest/plugin'

export default defineConfig({
  plugins: [vitestFork()],
  resolve: { conditions: ['@systemfsoftware/source', ...defaultClientConditions] },
  ssr: { resolve: { conditions: ['@systemfsoftware/source', ...defaultServerConditions] } },
  test: {
    includeSource: ['src/**/*.ts'],
    exclude: [...configDefaults.exclude, '**/.stryker-tmp/**'],
    setupFiles: ['./src/guard.ts'],
    passWithNoTests: true,
    testTimeout: 30_000,
    silent: 'passed-only',
  },
})
