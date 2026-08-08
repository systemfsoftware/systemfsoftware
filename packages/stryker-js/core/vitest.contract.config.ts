import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'

/**
 * The CLI contract lane. Separate from `vitest.config.ts` so the default
 * `test` task stays container-free (KTD5); this lane runs the real packed
 * tarball in a real container (KTD4).
 */
export default defineConfig({
  ...sharedConfig,
  test: {
    ...sharedConfig.test,
    include: ['__tests__/**/*.integration.test.ts'],

    // Overrides `sharedConfig`. R18: a glob matching nothing must fail, not pass.
    passWithNoTests: false,

    // Overrides `sharedConfig`. Keeps `src/**` in-source tests out of the container gate.
    includeSource: [],

    // Image pull and container start are charged to the first test, not a hook.
    // A real hang must still fail inside the lane, not as an outer runner kill.
    testTimeout: 300_000,
  },
})
