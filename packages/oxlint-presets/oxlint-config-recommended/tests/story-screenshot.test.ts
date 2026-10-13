import { expect, it } from 'vitest'

import { lintDiagnostics } from './__fixtures__/oxlint-diagnostics.js'

const CAPTURE_RULE = 'storybook-testing/visual-evidence-comes-from-the-runner'
const FETCH_RULE = 'ui-state/components-perform-no-io'
const CONSUMER_STORAGE_MESSAGE = 'Persist through the KeyValueStore service.'

interface Report {
  readonly severity: string
  readonly rule: string
}

const propertyBans = async (path: string, config: string) =>
  (await lintDiagnostics(config, path)).filter((diagnostic) => diagnostic.code === 'eslint(no-restricted-properties)')

const reportsNaming = async (path: string, config = 'recommended.config.ts'): Promise<readonly Report[]> =>
  (await propertyBans(path, config)).flatMap((diagnostic) =>
    [CAPTURE_RULE, FETCH_RULE]
      .filter((rule) => (diagnostic.help ?? '').startsWith(`${rule}:`))
      .map((rule) => ({ severity: diagnostic.severity, rule }))
  )

const CAPTURE_ERROR: Report = { severity: 'error', rule: CAPTURE_RULE }
const FETCH_ERROR: Report = { severity: 'error', rule: FETCH_RULE }

it.each([
  'src/screenshot/direct-component.stories.tsx',
  'src/screenshot/direct.stories.ts',
  'src/screenshot/destructured-component.stories.tsx',
  'src/screenshot/destructured.stories.ts',
])('reports the page.screenshot in %s once as an error whose message begins with the pack rule', async (path) => {
  expect(await reportsNaming(path)).toEqual([CAPTURE_ERROR])
}, 60_000)

it.each([
  'src/screenshot/canvas.stories.tsx',
  'src/screenshot/fetch.stories.ts',
  'src/screenshot/capture.ts',
  'src/screenshot/alias.stories.ts',
])('reports nothing for %s', async (path) => {
  expect(await reportsNaming(path)).toEqual([])
}, 60_000)

it('passes every preset rule on the capture registration the pack rule prescribes', async () => {
  expect(await lintDiagnostics('recommended.config.ts', '.storybook/preview.ts')).toEqual([])
}, 60_000)

it('keeps the .tsx fetch ban beside the capture ban in a .stories.tsx file', async () => {
  expect(await reportsNaming('src/screenshot/fetch-and-capture.stories.tsx')).toEqual([FETCH_ERROR, CAPTURE_ERROR])
}, 60_000)

it.each(
  [
    ['src/screenshot/fetch-and-capture.stories.tsx', [FETCH_ERROR, CAPTURE_ERROR]],
    ['src/screenshot/direct.stories.ts', [CAPTURE_ERROR]],
  ] as const,
)('keeps the preset bans on %s when a consumer spreads the exports into its own story override', async (
  path,
  expected,
) => {
  expect(await reportsNaming(path, 'consumer-spread.config.ts')).toEqual(expected)
}, 60_000)

it.each([
  'src/screenshot/storage-component.stories.tsx',
  'src/screenshot/storage.stories.ts',
])('keeps the consumer own property ban on %s beside the spread exports', async (path) => {
  const own = (await propertyBans(path, 'consumer-spread.config.ts'))
    .filter((diagnostic) => diagnostic.help === CONSUMER_STORAGE_MESSAGE)
    .map((diagnostic) => diagnostic.severity)
  expect(own).toEqual(['error'])
}, 60_000)
