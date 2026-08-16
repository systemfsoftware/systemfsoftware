import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'
import * as path from 'node:path'

export default defineConfig({
  ...sharedConfig,
  test: {
    ...sharedConfig.test,
    include: ['./test/**/*.test.ts'],
    pool: 'forks',
    coverage: {
      ...sharedConfig.test?.coverage,
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts'],
    },
  },
  resolve: {
    conditions: ['@systemfsoftware/source', 'source', 'import', 'node', 'default'],
    alias: {
      '@systemfsoftware/effect-atom/test': path.join(import.meta.dirname, 'test'),
      '@systemfsoftware/effect-atom': path.join(import.meta.dirname, 'src'),
      '@systemfsoftware/effect-gherkin-spec': path.join(import.meta.dirname, '../../effect-gherkin-spec/src/mod.ts'),
    },
  },
})
