import { expect, it } from 'vitest'

import { lintDiagnostics } from './__fixtures__/oxlint-diagnostics.js'

const CAPTURE_RULE = 'storybook-testing/visual-evidence-comes-from-the-runner'
const FETCH_RULE = 'ui-state/components-perform-no-io'

interface Report {
  readonly severity: string
  readonly rule: string
}

const reportsNaming = async (path: string, config = 'recommended.config.ts'): Promise<readonly Report[]> =>
  (await lintDiagnostics(config, path))
    .filter((diagnostic) => diagnostic.code === 'eslint(no-restricted-properties)')
    .flatMap((diagnostic) => {
      const text = `${diagnostic.message} ${diagnostic.help ?? ''}`
      return [CAPTURE_RULE, FETCH_RULE]
        .filter((rule) => text.includes(rule))
        .map((rule) => ({ severity: diagnostic.severity, rule }))
    })

const CAPTURE_ERROR: Report = { severity: 'error', rule: CAPTURE_RULE }
const FETCH_ERROR: Report = { severity: 'error', rule: FETCH_RULE }

it.each([
  'src/screenshot/direct-component.stories.tsx',
  'src/screenshot/direct.stories.ts',
  'src/screenshot/destructured-component.stories.tsx',
  'src/screenshot/destructured.stories.ts',
])('reports the page.screenshot in %s once as an error, naming the pack rule', async (path) => {
  expect(await reportsNaming(path)).toEqual([CAPTURE_ERROR])
}, 60_000)

it.each([
  'src/screenshot/canvas.stories.tsx',
  'src/screenshot/fetch.stories.ts',
  'src/screenshot/capture.ts',
])('reports nothing for %s', async (path) => {
  expect(await reportsNaming(path)).toEqual([])
}, 60_000)

it('passes every preset rule on the capture registration the pack rule prescribes', async () => {
  expect(await lintDiagnostics('recommended.config.ts', '.storybook/preview.ts')).toEqual([])
}, 60_000)

it('keeps the .tsx fetch ban beside the capture ban in a .stories.tsx file', async () => {
  expect(await reportsNaming('src/screenshot/fetch-and-capture.stories.tsx')).toEqual([FETCH_ERROR, CAPTURE_ERROR])
}, 60_000)

it('keeps both bans on a story when a consumer spreads the exports into its own .stories.tsx override', async () => {
  expect(await reportsNaming('src/screenshot/fetch-and-capture.stories.tsx', 'consumer-spread.config.ts')).toEqual([
    FETCH_ERROR,
    CAPTURE_ERROR,
  ])
}, 60_000)
