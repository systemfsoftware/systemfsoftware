import { inlineRefutationCoverage } from '@systemfsoftware/effect-schema-refutation-vite'
import { inlineSchemaTests } from '@systemfsoftware/effect-schema-vite'
import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'

export default defineConfig({
  ...sharedConfig,
  plugins: [inlineSchemaTests(), inlineRefutationCoverage()],
  test: {
    ...sharedConfig.test,
    include: ['src/**/*.test.ts'],
    setupFiles: ['./vitest-setup.ts'],
  },
})
