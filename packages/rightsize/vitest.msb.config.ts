import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'

/**
 * The microsandbox (msb) runtime lane (R10, RS-LANE): the msb-conditional
 * contract cases, kept behind the `RIGHTSIZE_MSB_IT` gate until a
 * KVM-capable runner exists (none exists in this repo's CI today). Without
 * the gate these cases SKIP — deliberately the one gated lane in this
 * package, mirroring upstream's own `RIGHTSIZE_IT` discipline; the docker
 * parity lane (`vitest.parity.config.ts`) never skips.
 *
 * The gate is checked per-case inside the test files (not here) so a run
 * without the env var shows the cases as skipped, not hidden.
 */
export default defineConfig({
  ...sharedConfig,
  test: {
    ...sharedConfig.test,
    include: ['__tests__/msb/**/*.integration.test.ts'],
    includeSource: [],
    coverage: { enabled: false },
    // msb's provisioner downloads the pinned binary at layer build, and a
    // microVM boot is the slowest possible cold start here.
    testTimeout: 90_000,
    teardownTimeout: 30_000,
  },
})
