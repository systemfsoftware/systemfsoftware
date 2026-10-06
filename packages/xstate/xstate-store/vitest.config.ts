import { readFileSync } from 'node:fs'

import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'

// The verbatim upstream tests (plan U1) run in the `upstream-verbatim` project, which the vitest-config
// guard exemption table names; every other test file runs guarded in `own`. The list is checked against
// the import commit by scripts/guards/check-upstream-test-manifest.ts.
const upstream: ReadonlyArray<string> =
  JSON.parse(readFileSync(new URL('./upstream-tests.json', import.meta.url), 'utf8')).files

export default defineConfig({
  ...sharedConfig,
  resolve: { ...sharedConfig.resolve, conditions: ['module', 'development', 'browser', '@systemfsoftware/source'] },
  test: {
    ...sharedConfig.test,
    environment: 'happy-dom',
    server: { deps: { inline: ['@statelyai/inspect'] } },
    projects: [
      {
        extends: true,
        test: {
          name: 'upstream-verbatim',
          globals: true,
          include: [...upstream.filter((file) => file.startsWith('test/'))],
        },
      },
      {
        extends: true,
        test: {
          name: 'own',
          include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.{ts,tsx}', 'test/**/*.test.{ts,tsx}'],
          exclude: [...(sharedConfig.test?.exclude ?? []), ...upstream],
        },
      },
    ],
  },
})
