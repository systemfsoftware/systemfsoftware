import { inlineSchemaTests } from '@systemfsoftware/effect-schema-vite'
import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'

export default defineConfig({
  ...sharedConfig,
  plugins: [inlineSchemaTests()],
  test: {
    ...sharedConfig.test,
    include: [
      'src/**/*.test.ts',
      'tests/checker-group-then-check.integration.test.ts',
      'tests/exit-code.integration.test.ts',
      'tests/remembered-attribution.integration.test.ts',
      'tests/verdict-envelope.integration.test.ts',
    ],
    testTimeout: 60_000,
  },
})
