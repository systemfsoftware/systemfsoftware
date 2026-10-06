import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'

export default defineConfig({
  ...sharedConfig,
  test: {
    ...sharedConfig.test,
    environment: 'node',
    projects: [
      {
        extends: true,
        test: {
          name: 'own',
          globals: true,
          include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.{ts,tsx}'],
          // The re-homed upstream property suite registers its fixtures with vitest's own globals at
          // collection time (disposition.json R4), so the oracle lane's exempt `replacements` project owns
          // it; this guarded project does not run it.
          exclude: ['tests/property-suite.replacement.test.ts'],
        },
      },
    ],
  },
})
