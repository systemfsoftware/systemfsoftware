import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    root: import.meta.dirname,
    include: ['tests/**/*.test.ts'],
    includeSource: ['src/**/*.ts'],
    pool: 'forks',
  },
  resolve: {
    conditions: ['@systemfsoftware/source'],
  },
})
