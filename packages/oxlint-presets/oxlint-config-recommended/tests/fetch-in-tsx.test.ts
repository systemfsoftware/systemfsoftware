import { expect, it } from 'vitest'

import { lintDiagnostics } from './__fixtures__/oxlint-diagnostics.js'

const PACK_RULE = 'ui-state/components-perform-no-io'
const FETCH_BAN_CODES: Record<string, true> = {
  'eslint(no-restricted-globals)': true,
  'eslint(no-restricted-properties)': true,
}

const fetchReportsNamingTheRule = async (path: string): Promise<readonly boolean[]> =>
  (await lintDiagnostics('recommended.config.ts', path))
    .filter((diagnostic) => FETCH_BAN_CODES[diagnostic.code] === true)
    .map((diagnostic) => `${diagnostic.message} ${diagnostic.help ?? ''}`.includes(PACK_RULE))

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
