import { inlineSchemaTests } from '@systemfsoftware/effect-schema-vite'
import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'

const CONFORMANCE = 'tests/**/*.conformance.test.ts'
const CONTRACT = 'tests/**/*.contract.test.ts'

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
          exclude: [...(sharedConfig.test?.exclude ?? []), CONFORMANCE, CONTRACT],
          includeSource: ['src/**/*.ts'],
          setupFiles: ['vitest-setup.ts'],
        },
      },
      { extends: true, test: { name: 'conformance', include: [CONFORMANCE] } },
      { extends: true, test: { name: 'contract', include: [CONTRACT] } },
    ],
  },
})
