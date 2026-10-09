import { vitestFork } from '@systemfsoftware/vitest/plugin'
import { defaultClientConditions, defaultServerConditions } from 'vite'
import { configDefaults, defineConfig } from 'vitest/config'

const INTEGRATION = 'tests/**/*.integration.test.ts'
const VM_BOOT_MILLIS = 900_000

export default defineConfig({
  plugins: [vitestFork()],
  resolve: { conditions: ['@systemfsoftware/source', ...defaultClientConditions] },
  ssr: { resolve: { conditions: ['@systemfsoftware/source', ...defaultServerConditions] } },
  test: {
    includeSource: ['src/**/*.{js,ts}'],
    exclude: [...configDefaults.exclude, '**/.stryker-tmp/**'],
    passWithNoTests: true,
    testTimeout: 30_000,
    silent: 'passed-only',
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
          exclude: [...configDefaults.exclude, '**/.stryker-tmp/**', INTEGRATION],
          setupFiles: ['@systemfsoftware/vitest/guard'],
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: [INTEGRATION],
          globalSetup: ['vitest-kvm-preflight.ts'],
          fileParallelism: false,
          testTimeout: VM_BOOT_MILLIS,
          hookTimeout: VM_BOOT_MILLIS,
          setupFiles: ['@systemfsoftware/vitest/guard'],
        },
      },
    ],
  },
})
