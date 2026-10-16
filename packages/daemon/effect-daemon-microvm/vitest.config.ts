import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'

const INTEGRATION = 'tests/**/*.integration.test.ts'
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
          exclude: [...(sharedConfig.test?.exclude ?? []), INTEGRATION],
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: [INTEGRATION],
          globalSetup: ['vitest-kvm-preflight.ts'],
          fileParallelism: false,
          testTimeout: VM_BOOT_MILLIS,
          hookTimeout: VM_BOOT_MILLIS,
        },
      },
    ],
  },
})
