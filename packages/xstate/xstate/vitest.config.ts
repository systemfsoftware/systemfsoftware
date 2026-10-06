import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'

export default defineConfig({
  ...sharedConfig,
  test: {
    ...sharedConfig.test,
    environment: 'node',
    projects: [
      {
        extends: true,
        test: {
          name: 'own',
          globals: true,
          include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.{ts,tsx}'],
        },
      },
    ],
  },
})
