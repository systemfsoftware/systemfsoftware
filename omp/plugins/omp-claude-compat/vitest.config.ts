import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    root: import.meta.dirname,
    include: ['tests/**/*.test.ts', 'src/**/*.property.test.ts'],
    includeSource: ['src/**/*.ts'],
  },
  resolve: {
    conditions: ['@systemfsoftware/source'],
  },
})
