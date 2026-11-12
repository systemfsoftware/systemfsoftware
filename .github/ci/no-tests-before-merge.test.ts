// Run: deno test --config=scripts/deno.jsonc .github/ci/no-tests-before-merge.test.ts
import { isQueueDraft, planJobs } from './no-tests-before-merge.ts'

Deno.test('a Mergify queue draft is the per-change profile, not a no-tests plan', () => {
  if (!isQueueDraft('mergify/merge-queue/abc123')) throw new Error('queue draft not recognised')
  if (planJobs('mergify/merge-queue/abc123') !== undefined) throw new Error('queue draft got a no-tests plan')
})

Deno.test('an ordinary pull request plans no packed test job', () => {
  for (const head of ['feat/x', 'mergify/other/x', 'main', '']) {
    if (isQueueDraft(head)) throw new Error(`${head} read as queue draft`)
    if (planJobs(head) !== '[]') throw new Error(`${head} did not plan []`)
  }
  if (planJobs(undefined) !== '[]') throw new Error('absent head ref did not plan []')
})
