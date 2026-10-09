import { defaultClientConditions, defaultServerConditions } from 'vite'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { conditions: ['@systemfsoftware/source', ...defaultClientConditions] },
  ssr: { resolve: { conditions: ['@systemfsoftware/source', ...defaultServerConditions] } },
  test: {
    include: ['src/**/*.test.ts'],
    coverage: { provider: 'v8' },
  },
})
