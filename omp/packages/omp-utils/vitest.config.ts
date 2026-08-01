import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    root: import.meta.dirname,
    include: ['__tests__/**/*.test.ts'],
    pool: 'forks',
  },
  resolve: {
    conditions: ['@systemfsoftware/source'],
  },
})
