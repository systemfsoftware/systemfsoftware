import { inlineSchemaTests } from '@systemfsoftware/effect-schema-vite'
import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'

export default defineConfig({
  ...sharedConfig,
  plugins: [inlineSchemaTests({ refutationCoverage: true })],
  test: {
    ...sharedConfig.test,
    include: ['src/**/*.test.ts'],
    setupFiles: ['./vitest-setup.ts'],
  },
})
