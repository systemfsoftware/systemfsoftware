import { vitestFork } from '@systemfsoftware/vitest/plugin'
import { defaultClientConditions, defaultServerConditions } from 'vite'
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [vitestFork()],
  resolve: { conditions: ['@systemfsoftware/source', ...defaultClientConditions] },
  ssr: { resolve: { conditions: ['@systemfsoftware/source', ...defaultServerConditions] } },
  test: {
    include: ['tests/**/*.test.ts'],
    // The capability, not a record of what exists: this package currently has no
    // `import.meta.vitest` block, and in-source blocks are permitted for
    // module-private helpers. Without the glob the next such block would
    // silently never run.
    includeSource: ['src/**/*.ts'],
    exclude: [...configDefaults.exclude, '**/.stryker-tmp/**'],
    setupFiles: ['@systemfsoftware/vitest/guard'],
    passWithNoTests: true,
    testTimeout: 30_000,
    silent: 'passed-only',
  },
})
