import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { expect, it } from 'vitest'

const FIXTURE = fileURLToPath(new URL('../outside-src-fixture/', import.meta.url))
const OXLINT = fileURLToPath(new URL('../node_modules/.bin/oxlint', import.meta.url))

const reportedRules = (): Promise<readonly string[]> => {
  const { promise, resolve } = Promise.withResolvers<readonly string[]>()
  execFile(OXLINT, ['-c', 'recommended.config.ts', '--format=unix', 'scripts'], { cwd: FIXTURE }, (_error, stdout) => {
    resolve(stdout.split('\n').flatMap((line) => /^scripts\/.*\[\w+\/([\w-]+\([\w-]+\))\]$/.exec(line)?.[1] ?? []))
  })
  return promise
}

it('reports no unstable API use in a file outside the library, test and entry patterns', async () => {
  expect(await reportedRules()).toEqual(['jsdoc(check-tag-names)'])
}, 60_000)
