import { assertEquals } from '@std/assert'
import { planJobs, type TestPackage, type TimingRecord } from './test-timings.ts'

const pkg = (name: string): TestPackage => ({ name: `@s/${name}`, dir: `packages/${name}`, browser: false })
const record = (seconds: Readonly<Record<string, number>>): TimingRecord => ({
  version: 1,
  packages: Object.fromEntries(Object.entries(seconds).map(([name, s]) => [`@s/${name}`, { seconds: s, sha: 'x' }])),
})
const options = { target: 900, maxJobs: 20, unknownSeconds: 900 }

Deno.test('every job pairs each package with its own directory', () => {
  const plan = planJobs(
    [pkg('c'), pkg('a'), pkg('b'), pkg('huge')],
    record({ a: 100, b: 200, c: 300, huge: 2000 }),
    options,
  )
  for (const job of plan.jobs) {
    assertEquals(job.dirs, job.packages.map((name) => `packages/${name.replace('@s/', '')}`))
  }
})

Deno.test('packages that fit the target share a job', () => {
  const plan = planJobs([pkg('a'), pkg('b'), pkg('c')], record({ a: 100, b: 200, c: 300 }), options)
  assertEquals(plan.jobs.map((job) => job.packages), [['@s/a', '@s/b', '@s/c']])
})

Deno.test('a package over the target splits into ceil(seconds / target) shards', () => {
  const plan = planJobs([pkg('huge')], record({ huge: 2000 }), options)
  assertEquals(plan.jobs.map((job) => [job.shard?.index, job.shard?.count]), [[1, 3], [2, 3], [3, 3]])
})

Deno.test('a package with no record is predicted at the unknown estimate', () => {
  const plan = planJobs([pkg('a'), pkg('b')], record({}), options)
  assertEquals(plan.jobs.map((job) => job.packages.length), [1, 1])
})
