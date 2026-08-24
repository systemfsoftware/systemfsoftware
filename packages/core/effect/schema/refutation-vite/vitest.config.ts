import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'

const isFixtureRun = process.env['VITEST_FIXTURE_RUN'] === '1'

export default defineConfig({
  ...sharedConfig,
  test: {
    ...sharedConfig.test,
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    exclude: isFixtureRun
      ? [...(sharedConfig.test?.exclude ?? [])]
      : [...(sharedConfig.test?.exclude ?? []), '**/__fixtures__/**'],
  },
})
