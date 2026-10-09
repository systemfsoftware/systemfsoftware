import recommended from '@systemfsoftware/oxlint-config-recommended'
import { defineConfig } from 'oxlint'

/** This package is the Vitest runner: the test framework itself, not a test of something else. */
const RUNNER_ROLE: ['error', { role: 'vitest-runner' }] = ['error', { role: 'vitest-runner' }]

export default defineConfig({
  extends: [recommended],
  rules: {
    '@systemfsoftware/oxlint-plugin-test-discipline/vitest-from-systemfsoftware-vitest': RUNNER_ROLE,
    '@systemfsoftware/oxlint-plugin-test-discipline/test-suffix-outside-src': RUNNER_ROLE,
  },
})
