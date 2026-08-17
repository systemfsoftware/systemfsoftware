import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'

/**
 * The Docker parity lane (R7–R9, R11–R13, R18; leaf rule RS-LANE): the
 * executable oracle ported from upstream rightsize-node's contract suite,
 * running REAL containers through the docker backend — never the recording
 * doubles and never a skip. Exercised locally against podman's docker-
 * compatible socket and in CI against the docker daemon.
 *
 * Lane posture (each deliberate):
 * - `test:contract` is the turbo-keyed script name (turbo tasks are
 *   script-name-keyed; a differently named lane silently never runs) and
 *   the turbo task itself is `cache: false` (turbo.json) — the lane must
 *   genuinely rerun the daemon every invocation.
 * - The backend layer is composed in `test/parity/helpers.ts`:
 *   `layerDocker` over a `Selection` that can only ever be docker (a
 *   KVM-capable runner can't re-route the oracle to msb). When no runtime
 *   answers the discovery probe the layer fails with the library's own
 *   `BackendUnreachableError` naming every probed candidate; the lane
 *   NEVER skips (RS-LANE). The setup hook re-checks this before any test,
 *   so a dead socket fails the whole run up front with the named error.
 * - `passWithNoTests: false`: a lane that matches zero tests is broken.
 * - Timeouts: the slowest scenario is a cold container start through the
 *   wait interpreter (image pull, boot, readiness polling), so the per-test
 *   budget is sized for that, with a separate teardown budget.
 */
export default defineConfig({
  ...sharedConfig,
  test: {
    ...sharedConfig.test,
    include: ['__tests__/parity/**/*.integration.test.ts'],
    globalSetup: ['./__tests__/parity/setup.ts'],
    // R18/RS-LANE: matcher patterns were expanded (test/parity lives outside
    // `src/**`), so the default in-source suite would double-run if left on.

    // Overrides sharedConfig: the lane shares `reports/` with the `test`
    // task beside it; turbo discards both reports anyway.
    coverage: { enabled: false },
    // Overrides sharedConfig: cold container start dominates the budget.
    // The differential and health-check cases wait on real daemons.
    testTimeout: 90_000,
    teardownTimeout: 30_000,
    // Overrides sharedConfig: a lane that matches nothing is a broken lane.
    passWithNoTests: false,
  },
})
