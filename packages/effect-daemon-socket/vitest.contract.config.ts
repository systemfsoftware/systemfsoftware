import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'

// The contract lane: the medium proven against its real oracle — a loopback
// listener fixture in this process, dialed over a real TCP connection — plus the
// whole `Conformance.Scenarios` catalogue against the fiber reference. The default
// `test` lane excludes these files, so nothing here runs on the fast clock.
export default defineConfig({
  ...sharedConfig,
  test: {
    ...sharedConfig.test,
    include: ['tests/**/*.contract.test.ts'],
    setupFiles: ['vitest-setup.ts'],
  },
})
