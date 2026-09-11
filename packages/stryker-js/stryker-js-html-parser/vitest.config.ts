import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'

// The tests import this package by its published name, and a clean tree has no
// `dist/`, so resolution must reach source. Vitest 4's node environment resolves
// through the SSR pipeline, where `resolve.conditions` alone is inert.
const sourceConditions = ['@systemfsoftware/source']

export default defineConfig({
  ...sharedConfig,
  resolve: { conditions: sourceConditions },
  ssr: { resolve: { conditions: sourceConditions } },
  test: {
    ...sharedConfig.test,
    include: ['tests/**/*.test.ts'],
  },
})
