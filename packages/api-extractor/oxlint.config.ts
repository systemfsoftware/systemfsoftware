import recommended from '@systemfsoftware/oxlint-config-recommended'
import { defineConfig } from 'oxlint'

export default defineConfig({
  extends: [recommended],
  ignorePatterns: ['tests/e2e/vitest.e2e.config.ts'],
})
