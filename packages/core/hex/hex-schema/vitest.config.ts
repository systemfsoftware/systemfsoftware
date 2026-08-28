import { inlineSchemaTests } from '@systemfsoftware/effect-schema-vite'
import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'

export default defineConfig({
  ...sharedConfig,
  plugins: [inlineSchemaTests()],
  test: {
    ...sharedConfig.test,
    include: ['src/**/*.test.ts', 'tests/surface.snapshot.test.ts'],
    setupFiles: ['./vitest-setup.ts'],
  },

  resolve: {
    conditions: ['@systemfsoftware/source', 'source', 'import', 'node', 'default'],
  },
})
