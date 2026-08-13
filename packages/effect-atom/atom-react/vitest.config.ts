import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'
import * as path from 'node:path'

export default defineConfig({
  ...sharedConfig,
  test: {
    ...sharedConfig.test,
    include: ['./test/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    setupFiles: ['./vitest-setup.ts'],
    coverage: {
      ...sharedConfig.test?.coverage,
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}'],
    },
  },
  resolve: {
    conditions: ['@systemfsoftware/source', 'source', 'import', 'node', 'default'],
    alias: {
      '@systemfsoftware/effect-atom/test': path.join(__dirname, '../atom/test'),
      '@systemfsoftware/effect-atom': path.join(__dirname, '../atom/src'),
      '@systemfsoftware/effect-atom-react/test': path.join(__dirname, 'test'),
      '@systemfsoftware/effect-atom-react': path.join(__dirname, 'src'),
      '@systemfsoftware/effect-gherkin-spec-v4': path.join(__dirname, '../../effect-gherkin-spec-v4/src/mod.ts'),
    },
  },
})
