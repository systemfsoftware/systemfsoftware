import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { expect, it } from 'vitest'

const FIXTURE = fileURLToPath(new URL('../ui-state-fixture/', import.meta.url))
const OXLINT = fileURLToPath(new URL('../node_modules/.bin/oxlint', import.meta.url))

const PACK_RULE = 'ui-state/components-perform-no-io'
const FETCH_BAN_CODES: Record<string, true> = {
  'eslint(no-restricted-globals)': true,
  'eslint(no-restricted-properties)': true,
}

interface Diagnostic {
  readonly code: string
  readonly message: string
  readonly help?: string
}

const lintOutput = (path: string): Promise<string> => {
  const { promise, resolve } = Promise.withResolvers<string>()
  execFile(OXLINT, ['-c', 'recommended.config.ts', '--format=json', path], { cwd: FIXTURE }, (_error, stdout) => {
    resolve(stdout)
  })
  return promise
}

const fetchReportsNamingTheRule = async (path: string): Promise<readonly boolean[]> => {
  const { diagnostics } = JSON.parse(await lintOutput(path)) as { readonly diagnostics: readonly Diagnostic[] }
  return diagnostics
    .filter((diagnostic) => FETCH_BAN_CODES[diagnostic.code] === true)
    .map((diagnostic) => `${diagnostic.message} ${diagnostic.help ?? ''}`.includes(PACK_RULE))
}

it.each([
  'src/fetch/bare.tsx',
  'src/fetch/alias.tsx',
  'src/fetch/type-of.tsx',
  'src/fetch/global-this.tsx',
  'src/fetch/window.tsx',
  'src/fetch/self.tsx',
  'src/Page.stories.tsx',
  'outside-src.tsx',
])('reports the fetch in %s once, naming the pack rule', async (path) => {
  expect(await fetchReportsNamingTheRule(path)).toEqual([true])
}, 60_000)

it.each([
  'src/demand.service.ts',
  'src/fetch/shadowed.tsx',
])('reports nothing for %s', async (path) => {
  expect(await fetchReportsNamingTheRule(path)).toEqual([])
}, 60_000)
