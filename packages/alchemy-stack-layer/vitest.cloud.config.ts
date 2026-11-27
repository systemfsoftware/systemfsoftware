import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'
import { CLOUD_TESTS } from './vitest.config.js'

export default defineConfig({
  ...sharedConfig,
  test: {
    ...sharedConfig.test,
    include: CLOUD_TESTS,
    passWithNoTests: false,
    env: { CONFORMANCE_PROFILE: 'per-change', ALCHEMY_TELEMETRY_DISABLED: '1' },
  },
})
