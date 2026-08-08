import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'

/**
 * The config Stryker runs with. Identical to `vitest.config.ts` except that it
 * drops the spec which calls `process.chdir()`.
 *
 * `@systemfsoftware/stryker-js-vitest-runner` hardcodes `pool: 'threads'`, and Node
 * forbids `process.chdir()` on a worker thread, so that spec throws during
 * the initial dry run and aborts the whole mutation run. It exercises the CLI
 * against a fixture project on disk, which needs a real working directory --
 * `process.cwd()` cannot be stubbed for it because `ConfigReader` probes the
 * filesystem directly and would find this package's own config instead.
 *
 * Nothing is lost: the mutation surface is the pure decisions this fork owns,
 * today only `src/test-contribution.ts`; this spec never imports it, and
 * `related: true` already excludes it from every mutant run. It still runs
 * under `pnpm test`, which is its gate.
 */
export default defineConfig({
  ...sharedConfig,
  test: {
    ...sharedConfig.test,
    include: ['test/**/*.spec.ts'],
    exclude: ['test/unit/reporter-wiring.spec.ts'],
  },
})
