import { vitestFork } from '@systemfsoftware/vitest/plugin'
import { defaultClientConditions, defaultServerConditions } from 'vite'
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [vitestFork()],
  resolve: { conditions: ['@systemfsoftware/source', ...defaultClientConditions] },
  ssr: { resolve: { conditions: ['@systemfsoftware/source', ...defaultServerConditions] } },
  test: {
    include: [],
    includeSource: [],
    exclude: [...configDefaults.exclude, '**/.stryker-tmp/**'],
    setupFiles: ['@systemfsoftware/vitest/guard'],
    passWithNoTests: true,
    testTimeout: 60_000,
    silent: 'passed-only',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/mod.ts'],
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
          includeSource: ['src/**/*.{js,ts}'],
        },
      },
    ],
  },
})
