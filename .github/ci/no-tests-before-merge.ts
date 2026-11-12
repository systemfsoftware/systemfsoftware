// no-tests-before-merge - the `plan` phase for a pull request's local profile: it plans no packed test job.
//
// A Mergify queue draft (`mergify/merge-queue/*`) is the per-change profile (SYS-1369): its plan is the full suite
// from test-timings.ts, so this planner refuses it rather than write an empty plan the merge gate would trust.
const QUEUE_HEAD_PREFIX = 'mergify/merge-queue/'

export const isQueueDraft = (headRef: string | undefined): boolean => headRef?.startsWith(QUEUE_HEAD_PREFIX) ?? false

/** The `jobs` output for `plan`, or `undefined` when this head must not be planned here. */
export const planJobs = (headRef: string | undefined): string | undefined => isQueueDraft(headRef) ? undefined : '[]'

if (import.meta.main && Deno.args[0] === 'plan') {
  const jobs = planJobs(Deno.env.get('GITHUB_HEAD_REF'))
  if (jobs === undefined) {
    console.error('no-tests-before-merge: a mergify/merge-queue/ draft runs the per-change plan (test-timings.ts)')
    Deno.exit(1)
  }
  const output = Deno.env.get('GITHUB_OUTPUT')
  if (output) await Deno.writeTextFile(output, `jobs=${jobs}\n`, { append: true })
}
