import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { conditions: ['@systemfsoftware/source'] },
  ssr: { resolve: { conditions: ['@systemfsoftware/source'] } },
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
    },
  },
})
