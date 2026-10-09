import { vitestFork } from '@systemfsoftware/vitest/plugin'
import { defaultClientConditions, defaultServerConditions } from 'vite'
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [vitestFork()],
  resolve: { conditions: ['@systemfsoftware/source', ...defaultClientConditions] },
  ssr: { resolve: { conditions: ['@systemfsoftware/source', ...defaultServerConditions] } },
  test: {
    include: ['tests/**/*.integration.test.ts'],
    // Probe fixtures are suites the conformance tests run themselves, with `config: false`.
    includeSource: ['src/**/*.{js,ts}'],
    exclude: [...configDefaults.exclude, '**/.stryker-tmp/**', 'tests/__fixtures__/**'],
    setupFiles: ['@systemfsoftware/vitest/guard'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    passWithNoTests: true,
    silent: 'passed-only',
  },
})
