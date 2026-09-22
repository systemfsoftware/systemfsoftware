import { defineConfig } from '@systemfsoftware/vitest-config'

export default defineConfig({
  test: {
    include: [
      'tests/e2e/**/*.e2e.test.ts',
    ],
  },
})
