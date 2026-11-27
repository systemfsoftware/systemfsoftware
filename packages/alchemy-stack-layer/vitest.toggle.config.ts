import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'
import { ENGINE_TOGGLE_TESTS } from './vitest.config.js'

export default defineConfig({
  ...sharedConfig,
  test: {
    ...sharedConfig.test,
    include: ENGINE_TOGGLE_TESTS,
    passWithNoTests: false,
    env: {
      CONFORMANCE_PROFILE: 'per-change',
      ALCHEMY_TELEMETRY_DISABLED: '1',
      ALCHEMY_TEST_STAGE: 'offline',
      ALCHEMY_TEST_DEV: '0',
    },
  },
})
