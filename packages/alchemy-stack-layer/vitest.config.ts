import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'

export const ENGINE_TOGGLE_TESTS = ['tests/engine-toggle.integration.test.ts']

export default defineConfig({
  ...sharedConfig,
  test: {
    ...sharedConfig.test,
    include: ['tests/**/*.test.ts'],
    exclude: [...(sharedConfig.test?.exclude ?? []), ...ENGINE_TOGGLE_TESTS],
    includeSource: ['src/**/*.ts'],
    passWithNoTests: false,
    env: { CONFORMANCE_PROFILE: 'per-change', ALCHEMY_TELEMETRY_DISABLED: '1', ALCHEMY_TEST_STAGE: 'offline' },
  },
})
