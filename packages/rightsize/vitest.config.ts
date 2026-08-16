import { inlineSchemaTests } from '@systemfsoftware/effect-schema-vite'
import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'

export default defineConfig({
  ...sharedConfig,
  plugins: [inlineSchemaTests()],
  test: {
    ...sharedConfig.test,
    include: [
      'src/**/*.test.ts',
      '__tests__/*.test.ts',
      '__tests__/helpers/**/*.test.ts',
      '!__tests__/parity/**',
      '!__tests__/msb/**',
    ],
    setupFiles: ['vitest-setup.ts'],
  },
})
