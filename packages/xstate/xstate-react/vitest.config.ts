import { readFileSync } from 'node:fs'

import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'

// The verbatim upstream tests (plan U1) run in the `upstream-verbatim` project, which the vitest-config
// guard exemption table names; every other test file runs guarded in `own`. The list is checked against
// the import commit by scripts/guards/check-upstream-test-manifest.ts.
const manifest: { files: string[]; ported?: Array<{ port: string }> } = JSON.parse(
  readFileSync(new URL('./upstream-tests.json', import.meta.url), 'utf8'),
)
const upstream: ReadonlyArray<string> = [...manifest.files, ...(manifest.ported ?? []).map((entry) => entry.port)]

// Upstream's tests import the upstream package names; they resolve to the fork's packages here.
const upstreamSpecifiers = [
  { find: /^xstate(\/.*)?$/, replacement: '@systemfsoftware/xstate$1' },
  { find: /^@xstate\/(effect|react|store|store-react|test)(\/.*)?$/, replacement: '@systemfsoftware/xstate-$1$2' },
]

const sharedAlias = Object.entries(sharedConfig.resolve?.alias ?? {}).map(([find, replacement]) => ({
  find,
  replacement,
}))

export default defineConfig({
  ...sharedConfig,
  resolve: {
    ...sharedConfig.resolve,
    alias: [...sharedAlias, ...upstreamSpecifiers],
    conditions: ['module', 'development', 'browser', '@systemfsoftware/source'],
  },
  test: {
    ...sharedConfig.test,
    environment: 'happy-dom',
    projects: [
      {
        extends: true,
        test: {
          name: 'upstream-verbatim',
          globals: true,
          include: [...upstream],
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
