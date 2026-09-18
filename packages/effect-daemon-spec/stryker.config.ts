export default {
  extends: '@systemfsoftware/stryker-config/base',
  mutate: [
    'src/**/*.workflow.ts',
    '!src/**/*.test.ts',
    '!src/**/*.property.test.ts',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
  ],
  plugins: [
    '@systemfsoftware/stryker-js-vitest-runner',
    '@systemfsoftware/stryker-js-typescript-checker',
    '@systemfsoftware/stryker-ignorer-in-source-vitest-block',
  ],
  ignorers: [
    'effect-schema-declarations',
    'in-source-vitest-block',
  ],
  thresholds: {
    break: 100,
    high: 100,
    low: 100,
  },
  disableBail: true,
  dryRunTimeoutMinutes: 10,
  ignorePatterns: null,
}
