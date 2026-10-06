import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'

export default defineConfig({
  ...sharedConfig,
  resolve: {
    ...sharedConfig.resolve,
    conditions: ['module', 'development', 'browser', '@systemfsoftware/source'],
  },
  test: {
    ...sharedConfig.test,
    environment: 'happy-dom',
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
