import { inlineSchemaTests } from '@systemfsoftware/effect-schema-vite'
import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  ...sharedConfig,
  plugins: [tsconfigPaths({ ignoreConfigErrors: true }), inlineSchemaTests()],
  test: {
    ...sharedConfig.test,
    include: ['src/**/*.test.ts'],
    setupFiles: ['./vitest.setup.ts'],
    testTimeout: 120_000,
  },
})
