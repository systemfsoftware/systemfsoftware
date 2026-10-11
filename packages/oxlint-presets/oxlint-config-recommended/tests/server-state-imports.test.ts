import { execFile } from 'node:child_process'
import { matchesGlob } from 'node:path'
import { fileURLToPath } from 'node:url'

import effectPlatform from '@systemfsoftware/oxlint-plugin-effect-platform'
import { expect, it } from 'vitest'

const FIXTURE = fileURLToPath(new URL('../ui-state-fixture/', import.meta.url))
const OXLINT = fileURLToPath(new URL('../node_modules/.bin/oxlint', import.meta.url))

// R5 of compound-packs/ui-state/server-data-lives-in-atoms.md, written out from the pack rule, not read from the preset.
const SERVER_STATE = [
  '@tanstack/react-query',
  '@tanstack/react-query-devtools',
  '@tanstack/react-query-persist-client',
  '@tanstack/react-query-next-experimental',
  'react-query',
  'swr',
  'urql',
  '@apollo/client/react',
  '@reduxjs/toolkit/query/react',
  '@trpc/react-query',
  '@trpc/tanstack-react-query',
] as const

const PACK_RULE = 'ui-state/server-data-lives-in-atoms'

const NODE_BUILTIN = 'node:fs'
const SERVER_STATE_IMPORT = '@tanstack/react-query'
const CONSUMER_OWN = '@consumer/legacy-client'
const DRIFT_FILES = [
  'src/Page.tsx',
  'src/__fixtures__/both.ts',
  'fixtures/both.ts',
  'testResources/both.ts',
  'both.test.ts',
  'scripts/both.ts',
] as const

interface Diagnostic {
  readonly code: string
  readonly message: string
  readonly help?: string
}

interface RestrictedImport {
  readonly specifier: string
  readonly help: string
}

const lintOutput = (config: string, path: string): Promise<string> => {
  const { promise, resolve } = Promise.withResolvers<string>()
  execFile(OXLINT, ['-c', config, '--format=json', path], { cwd: FIXTURE }, (_error, stdout) => {
    resolve(stdout)
  })
  return promise
}

const restrictedImports = async (
  path: string,
  config = 'recommended.config.ts',
): Promise<readonly RestrictedImport[]> => {
  const { diagnostics } = JSON.parse(await lintOutput(config, path)) as { readonly diagnostics: readonly Diagnostic[] }
  return diagnostics
    .filter((diagnostic) => diagnostic.code === 'eslint(no-restricted-imports)')
    .map((diagnostic) => ({
      specifier: /^'(.+)' import/.exec(diagnostic.message)?.[1] ?? diagnostic.message,
      help: diagnostic.help ?? '',
    }))
}

const specifiers = async (path: string, config?: string): Promise<readonly string[]> =>
  (await restrictedImports(path, config)).map((report) => report.specifier).toSorted()

const libraryOf = (specifier: string): string =>
  SERVER_STATE.find((name) => specifier.startsWith(`${name}/`)) ?? specifier

it('reports an import of every server-state library the pack rule names', async () => {
  expect(await specifiers('src/server-state/names.ts')).toEqual([...SERVER_STATE].toSorted())
}, 60_000)

it('reports an import of a subpath of every server-state library the pack rule names', async () => {
  const libraries = (await specifiers('src/server-state/subpaths.ts')).map(libraryOf)
  expect(libraries.toSorted()).toEqual([...SERVER_STATE].toSorted())
}, 60_000)

it('reports type-only imports, re-exports and dynamic import() of a server-state library', async () => {
  expect(await specifiers('src/server-state/forms.ts')).toEqual(['@tanstack/react-query', 'swr', 'urql'])
}, 60_000)

it('reports a local module that re-exports a server-state hook', async () => {
  expect(await specifiers('src/shell.ts')).toEqual(['@tanstack/react-query'])
}, 60_000)

it('leaves server-state cores that also serve non-React code alone', async () => {
  expect(await specifiers('src/server-state/allowed.ts')).toEqual([])
}, 60_000)

it('names the pack rule in every server-state report', async () => {
  const helps = (await restrictedImports('src/server-state/names.ts')).map((report) => report.help.includes(PACK_RULE))
  expect(helps).toEqual(SERVER_STATE.map(() => true))
}, 60_000)

it('reports the node builtin and the server-state import in a source file', async () => {
  expect(await specifiers('src/Page.tsx')).toEqual([NODE_BUILTIN, SERVER_STATE_IMPORT].toSorted())
}, 60_000)

it('reports only the server-state import in a fixtures directory and in a script outside src', async () => {
  expect([await specifiers('src/__fixtures__/both.ts'), await specifiers('scripts/both.ts')]).toEqual([
    [SERVER_STATE_IMPORT],
    [SERVER_STATE_IMPORT],
  ])
}, 60_000)

// The drift guard takes its file groups from effect-platform's own exported overrides, so a glob it adds or moves is
// linted here. Within a group the last override matching a file decides its no-restricted-imports value.
const importGroups = effectPlatform.configs.recommended.overrides.filter(
  (override) => override.rules?.['no-restricted-imports'] !== undefined,
)

const decidingGroup = (file: string): number =>
  importGroups.findLastIndex((group) => group.files.some((glob) => matchesGlob(file, glob)))

const groupGlobs = importGroups.flatMap((group, index) =>
  group.files.map((glob) => ({
    glob,
    bansNodeBuiltins: group.rules?.['no-restricted-imports'] !== 'off',
    file: DRIFT_FILES.find((file) => matchesGlob(file, glob) && decidingGroup(file) === index),
  }))
)

const driftCases = groupGlobs.flatMap(({ glob, bansNodeBuiltins, file }) =>
  file === undefined
    ? []
    : [{ glob, file, expected: bansNodeBuiltins ? [NODE_BUILTIN, SERVER_STATE_IMPORT] : [SERVER_STATE_IMPORT] }]
)

it('has a drift fixture file for every glob effect-platform sets no-restricted-imports on', () => {
  expect(groupGlobs.filter(({ file }) => file === undefined).map(({ glob }) => glob)).toEqual([])
})

it.each(driftCases)(
  'keeps both bans under the preset in effect-platform group $glob ($file)',
  async ({ file, expected }) => {
    expect(await specifiers(file)).toEqual(expected.toSorted())
  },
  60_000,
)

it.each(driftCases)(
  'keeps both bans and the consumer pattern when a consumer spreads the exports, in group $glob ($file)',
  async ({ file, expected }) => {
    expect(await specifiers(file, 'consumer-spread.config.ts')).toEqual([...expected, CONSUMER_OWN].toSorted())
  },
  60_000,
)
