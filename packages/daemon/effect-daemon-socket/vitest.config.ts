import { inlineSchemaTests } from '@systemfsoftware/effect-schema-vite'
import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'

const CONFORMANCE = 'tests/**/*.conformance.test.ts'

export default defineConfig({
  ...sharedConfig,
  plugins: [inlineSchemaTests()],
  test: {
    ...sharedConfig.test,
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
          exclude: [...(sharedConfig.test?.exclude ?? []), CONFORMANCE],
          includeSource: ['src/**/*.ts'],
        },
      },
      { extends: true, test: { name: 'conformance', include: [CONFORMANCE] } },
    ],
  },
})
