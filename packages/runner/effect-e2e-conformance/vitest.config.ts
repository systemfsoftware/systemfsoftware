import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'

// The test files that drive a real browser. `test` runs every other test and needs no browser;
// `test:engine` runs these files and needs Chromium.
const BROWSER_TESTS = [
  'tests/web-engine-law.integration.test.ts',
  'tests/agent-act-web.integration.test.ts',
  'tests/cli-init.integration.test.ts',
  'tests/cli-run-web.integration.test.ts',
]

export default defineConfig({
  ...sharedConfig,
  test: {
    ...sharedConfig.test,
    exclude: [...(sharedConfig.test?.exclude ?? []), 'tests/__fixtures__/**'],
    testTimeout: 60_000,
    projects: [
      {
        extends: true,
        test: {
          name: 'pure',
          include: ['tests/**/*.integration.test.ts'],
          exclude: [...(sharedConfig.test?.exclude ?? []), 'tests/__fixtures__/**', ...BROWSER_TESTS],
        },
      },
      {
        extends: true,
        test: { name: 'engine', include: BROWSER_TESTS },
      },
    ],
  },
})
