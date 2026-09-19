import { defineConfig, sourceResolveConditions } from '@systemfsoftware/vitest-config'

export default defineConfig({
  ...sourceResolveConditions,
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
    },
  },
})
