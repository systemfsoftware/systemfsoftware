import { defineConfig, sharedConfig, type ViteUserConfig } from '@systemfsoftware/vitest-config'
import { fileURLToPath } from 'node:url'

const vendoredSource = fileURLToPath(new URL('../../../repos/mcp-conformance/src', import.meta.url))
const undiciShim = fileURLToPath(new URL('./tests/surfaces/mcp/__fixtures__/undici.fixture.ts', import.meta.url))

type Alias = { readonly find: string | RegExp; readonly replacement: string }
type AliasOptions = NonNullable<NonNullable<ViteUserConfig['resolve']>['alias']>

const aliasEntry = (find: string, replacement: string): Alias => ({ find, replacement })

const aliasEntries = (alias: AliasOptions | undefined): ReadonlyArray<Alias> =>
  alias === undefined
    ? []
    : Array.isArray(alias)
    ? alias.map(({ find, replacement }) => ({ find, replacement }))
    : Object.entries(alias).map(([find, replacement]) => ({ find, replacement }))

const runnerDependencies: Array<string> = [
  '@modelcontextprotocol/sdk',
  'ajv',
  'ajv-formats',
  'eventsource-parser',
  'express',
  'undici',
  'yaml',
  'zod',
]

export default defineConfig({
  ...sharedConfig,
  resolve: {
    conditions: sharedConfig.resolve?.conditions,
    alias: [
      ...aliasEntries(sharedConfig.resolve?.alias),
      aliasEntry('#mcp-conformance', vendoredSource),
      aliasEntry('undici', undiciShim),
    ],
    dedupe: runnerDependencies,
  },
  test: {
    ...sharedConfig.test,
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    includeSource: [],
  },
})
