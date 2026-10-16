import recommended from '@systemfsoftware/oxlint-config-recommended'
import { defineConfig } from 'oxlint'

export default defineConfig({
  extends: [recommended],
  /** This package is the Vitest runner: the test framework itself, not a test of something else. */
  settings: { '@systemfsoftware/oxlint-plugin-test-discipline': { role: 'vitest-runner' } },
})
