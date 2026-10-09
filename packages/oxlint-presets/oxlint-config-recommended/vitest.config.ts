import { sourceResolveConditions } from '@systemfsoftware/vitest-config'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  ...sourceResolveConditions,
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
