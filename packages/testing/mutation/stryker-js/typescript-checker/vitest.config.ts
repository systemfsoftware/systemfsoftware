import { inlineSchemaTests } from '@systemfsoftware/effect-schema-vite'
import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'

export default defineConfig({
  ...sharedConfig,
  plugins: [inlineSchemaTests()],
  test: {
    ...sharedConfig.test,
    include: ['src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/.stryker-tmp/**', '**/testResources/**'],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
})
