import { inlineSchemaTests } from '@systemfsoftware/effect-schema-vite'
import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'

// A run that collects no test file must fail.
export default defineConfig({
  ...sharedConfig,
  plugins: [inlineSchemaTests()],
  test: { ...sharedConfig.test, passWithNoTests: false },
})
