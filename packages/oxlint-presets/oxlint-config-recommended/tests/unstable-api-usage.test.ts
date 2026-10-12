import { expect, it } from 'vitest'

import { runOxlint } from './__fixtures__/oxlint-diagnostics.js'

const reportedRules = async (): Promise<readonly string[]> => {
  const { stdout } = await runOxlint({
    fixture: 'outside-src-fixture/',
    config: 'recommended.config.ts',
    format: 'unix',
    path: 'scripts',
  })
  return stdout.split('\n').flatMap((line) => /^scripts\/.*\[\w+\/([\w-]+\([\w-]+\))\]$/.exec(line)?.[1] ?? [])
}

it('reports no unstable API use in a file outside the library, test and entry patterns', async () => {
  expect(await reportedRules()).toEqual(['jsdoc(check-tag-names)'])
}, 60_000)
