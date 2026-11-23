import { expect, it } from 'vitest'

import { lintDiagnostics } from './__fixtures__/oxlint-diagnostics.js'

const effectNativeReports = async (file: string): Promise<readonly string[]> =>
  (await lintDiagnostics('recommended.config.ts', `src/effect-native/${file}.ts`))
    .filter((diagnostic) => diagnostic.code.startsWith('effecttsgo('))
    .map((diagnostic) => `${diagnostic.code} ${diagnostic.severity}`)
    .toSorted()

it.each([
  ['global-json', ['effecttsgo(global-json) error']],
  ['global-json-in-effect', ['effecttsgo(global-json-in-effect) error', 'effecttsgo(prefer-schema-over-json) error']],
  ['global-fetch', ['effecttsgo(global-fetch) error']],
  ['global-fetch-in-effect', ['effecttsgo(global-fetch-in-effect) error']],
  ['crypto-random-uuid', ['effecttsgo(crypto-random-uuid) error']],
  ['crypto-random-uuid-in-effect', ['effecttsgo(crypto-random-uuid-in-effect) error']],
  ['global-random', ['effecttsgo(global-random) error']],
  ['global-random-in-effect', ['effecttsgo(global-random-in-effect) error']],
  ['global-console', ['effecttsgo(global-console) error']],
  ['global-console-in-effect', ['effecttsgo(global-console-in-effect) error']],
  ['process-env-in-effect', ['effecttsgo(process-env-in-effect) error']],
  ['try-catch-in-effect-gen', ['effecttsgo(try-catch-in-effect-gen) error']],
])('reports the Effect-native violation in %s as an error', async (file, expected) => {
  expect(await effectNativeReports(file)).toEqual(expected)
}, 60_000)
