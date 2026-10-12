import { expect, it } from 'vitest'

import { lintDiagnostics } from './__fixtures__/oxlint-diagnostics.js'

const PACK_RULE = 'ui-state/components-perform-no-io'
const FETCH_BAN_CODES: Record<string, true> = {
  'eslint(no-restricted-globals)': true,
  'eslint(no-restricted-properties)': true,
}

interface FetchReport {
  readonly severity: string
  readonly namesPackRule: boolean
}

const fetchReports = async (path: string, config = 'recommended.config.ts'): Promise<readonly FetchReport[]> =>
  (await lintDiagnostics(config, path))
    .filter((diagnostic) => FETCH_BAN_CODES[diagnostic.code] === true)
    .map((diagnostic) => ({
      severity: diagnostic.severity,
      namesPackRule: `${diagnostic.message} ${diagnostic.help ?? ''}`.includes(PACK_RULE),
    }))

const ONE_ERROR_NAMING_THE_RULE: readonly FetchReport[] = [{ severity: 'error', namesPackRule: true }]

it.each([
  'src/fetch/bare.tsx',
  'src/fetch/alias.tsx',
  'src/fetch/type-of.tsx',
  'src/fetch/global-this.tsx',
  'src/fetch/window.tsx',
  'src/fetch/self.tsx',
  'src/Page.stories.tsx',
  'src/Page.tsx',
  'outside-src.tsx',
])('reports the fetch in %s once as an error, naming the pack rule', async (path) => {
  expect(await fetchReports(path)).toEqual(ONE_ERROR_NAMING_THE_RULE)
}, 60_000)

it.each([
  'src/demand.service.ts',
  'src/fetch/shadowed.tsx',
])('reports nothing for %s', async (path) => {
  expect(await fetchReports(path)).toEqual([])
}, 60_000)

const CONSUMER_OWN_ERROR: FetchReport = { severity: 'error', namesPackRule: false }

it('keeps the fetch ban beside the entries of a consumer that spreads the exports into its own .tsx bans', async () => {
  const reports = await Promise.all(
    ['src/Page.tsx', 'src/fetch/window.tsx'].map((path) => fetchReports(path, 'consumer-spread.config.ts')),
  )
  expect(reports).toEqual([
    [...ONE_ERROR_NAMING_THE_RULE, CONSUMER_OWN_ERROR],
    [...ONE_ERROR_NAMING_THE_RULE, CONSUMER_OWN_ERROR],
  ])
}, 60_000)
