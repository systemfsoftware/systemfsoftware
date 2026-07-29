import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    root: import.meta.dirname,
    include: ['__tests__/**/*.test.ts', 'src/**/*.property.test.ts'],
  },
  resolve: {
    conditions: ['@systemfsoftware/source'],
  },
})
