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
    include: ['tests/**/*.integration.test.ts'],
    globalSetup: ['./tests/__fixtures__/global-setup.ts'],

    // Overrides `sharedConfig`. R18: a glob matching nothing must fail, not pass.
    passWithNoTests: false,

    // Overrides `sharedConfig`. Keeps `src/**` in-source tests out of the container gate.
    includeSource: [],
    // v8 coverage ENOENTs across the testcontainers boundary, and this lane shares
    // `coverage/` with the `test` task beside it; turbo discards the report anyway.
    coverage: { enabled: false },

    // Packing and container start are charged to `globalSetup`, so the hook
    // budget stays at its default and these bound real work only: the slowest
    // scenario is the ~43s heartbeat fixture, and teardown is one container
    // stop. Both are tight enough that a genuine hang fails the lane.
    testTimeout: 75_000,
    teardownTimeout: 30_000,
  },
})
