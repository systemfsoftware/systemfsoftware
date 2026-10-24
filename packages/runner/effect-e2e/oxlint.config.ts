import recommended from '@systemfsoftware/oxlint-config-recommended'
import { defineConfig } from 'oxlint'

export default defineConfig({
  extends: [recommended],
  settings: { '@systemfsoftware/oxlint-plugin-test-discipline': { role: 'vitest-runner' } },
})
