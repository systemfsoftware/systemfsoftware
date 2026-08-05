import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'

/**
 * The config Stryker runs with. Identical to `vitest.config.ts` except that it
 * drops the two specs which call `process.chdir()`.
 *
 * `@stryker-mutator/vitest-runner` hardcodes `pool: 'threads'`, and Node
 * forbids `process.chdir()` on a worker thread, so those specs throw during
 * the initial dry run and abort the whole mutation run. They exercise the CLI
 * against a fixture project on disk, which needs a real working directory --
 * `process.cwd()` cannot be stubbed for them because `ConfigReader` probes the
 * filesystem directly and would find this package's own config instead.
 *
 * Nothing is lost: the mutated file is `src/reporters/test-contribution.ts`,
 * these specs never import it, and `related: true` already excludes them from
 * every mutant run. They still run under `pnpm test`, which is their gate.
 */
export default defineConfig({
  ...sharedConfig,
  test: {
    ...sharedConfig.test,
    include: ['test/**/*.spec.ts'],
    exclude: ['test/unit/cli-options.spec.ts', 'test/unit/survivors.spec.ts'],
  },
})
