import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'

/**
 * The `attw` CLI contract lane. Separate from `vitest.config.ts` so the default
 * `test` task stays container-free; this lane runs the real packed tarball in
 * a real container.
 *
 * Characterizes the observable CLI surface (exit codes, output format
 * structure, key problem-kind markers, --from-npm, --pack) so the Effect-TS
 * rewrite has a safety net and the new binary can prove parity.
 */
export default defineConfig({
  ...sharedConfig,
  test: {
    ...sharedConfig.test,
    include: ['__tests__/**/*.feature.test.ts'],
    globalSetup: ['./__tests__/global-setup.ts'],

    // Overrides `sharedConfig`. A glob matching nothing must fail, not pass.
    passWithNoTests: false,

    // Overrides `sharedConfig`. Keeps `src/**` in-source tests out of the container gate.
    includeSource: [],

    // Packing and container start are charged to `globalSetup`, so the hook
    // budget stays at its default and these bound real work only. The slowest
    // scenario is a full `attw` analysis run against a fixture; teardown is one
    // container stop.
    testTimeout: 120_000,
    teardownTimeout: 30_000,
  },
})
