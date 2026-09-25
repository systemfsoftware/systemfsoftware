import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'

const CONFORMANCE = 'tests/**/*.conformance.test.ts'
const CONTRACT = 'tests/**/*.contract.test.ts'
const VM_BOOT_MILLIS = 900_000

export default defineConfig({
  ...sharedConfig,
  test: {
    ...sharedConfig.test,
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
          exclude: [...(sharedConfig.test?.exclude ?? []), CONFORMANCE, CONTRACT],
        },
      },
      { extends: true, test: { name: 'conformance', include: [CONFORMANCE] } },
      {
        extends: true,
        test: {
          name: 'contract',
          include: [CONTRACT],
          globalSetup: ['vitest-kvm-preflight.ts'],
          fileParallelism: false,
          testTimeout: VM_BOOT_MILLIS,
          hookTimeout: VM_BOOT_MILLIS,
        },
      },
    ],
  },
})
