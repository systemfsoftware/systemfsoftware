import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { describe, it } from '@systemfsoftware/vitest'
import { Effect } from 'effect'

const FIXTURE = fileURLToPath(new URL('../../outside-src-fixture/', import.meta.url))
const OXLINT = fileURLToPath(new URL('../../node_modules/.bin/oxlint', import.meta.url))

const reportedRules = Effect.callback<readonly string[]>((resume) => {
  execFile(OXLINT, ['-c', 'recommended.config.ts', '--format=unix', 'scripts'], { cwd: FIXTURE }, (_error, stdout) => {
    const rules = stdout.split('\n').flatMap((line) => /^scripts\/.*\[\w+\/([\w-]+\([\w-]+\))\]$/.exec(line)?.[1] ?? [])
    resume(Effect.succeed(rules))
  })
})

describe('effecttsgo/unstable-api-usage', () => {
  it('Should_ReportNoUnstableApiUsage_When_TheFileIsOutsideSrcAndTheTestPatterns', function*({ expect }) {
    const rules = yield* reportedRules
    yield* expect(rules).toEqual(['jsdoc(check-tag-names)'])
  }, 60_000)
})
