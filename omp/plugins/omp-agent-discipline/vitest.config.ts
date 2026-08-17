import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    root: import.meta.dirname,
    include: ['tests/**/*.test.ts', 'src/**/*.property.test.ts'],
    testTimeout: 30000,
  },
  resolve: {
    conditions: ['@systemfsoftware/source'],
  },
})
