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
 * The dropped spec never imports the remaining lanes, and `related: true`
 * already excludes it from every mutant run. It still runs under `pnpm test`.
 *
 * The paths track `vitest.config.ts`. When the behaviour lane moved to
 * `tests/*.integration.test.ts` these two globs kept naming the retired
 * `test/**` layout, so the runner collected nothing and every mutant run for
 * this package died in its dry run reporting "No tests were executed" -- an
 * empty glob reads as a configuration error there, never as a passing zero.
 */
export default defineConfig({
  ...sharedConfig,
  test: {
    ...sharedConfig.test,
    include: ['tests/**/*.integration.test.ts'],
    exclude: ['tests/reporter-wiring.integration.test.ts'],
  },
})
