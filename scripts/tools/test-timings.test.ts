import { assert, assertEquals } from '@std/assert'
import {
  emptyRecord,
  entriesFromTurboSummary,
  type Measured,
  mergeRecord,
  type Part,
  planJobs,
  type PlanOptions,
  type TestPackage,
  type TimingRecord,
} from './test-timings.ts'

const options: PlanOptions = { target: 300, maxJobs: 12, unknownSeconds: 60 }

const pkg = (name: string, browser = false): TestPackage => ({ name: `@s/${name}`, dir: `packages/${name}`, browser })

const recordOf = (seconds: Record<string, number>): TimingRecord => ({
  version: 1,
  packages: Object.fromEntries(Object.entries(seconds).map(([name, s]) => [`@s/${name}`, { seconds: s, sha: 'old' }])),
})

Deno.test('no whole-package job is predicted over the target', () => {
  const packages = ['a', 'b', 'c', 'd', 'e'].map((name) => pkg(name))
  const plan = planJobs(packages, recordOf({ a: 200, b: 150, c: 120, d: 90, e: 30 }), options)
  assert(plan.jobs.every((job) => job.predicted <= 300))
  assertEquals(plan.jobs.flatMap((job) => job.packages).sort(), packages.map((p) => p.name).sort())
})

Deno.test('a package over the target is split into shards that each fit', () => {
  const plan = planJobs([pkg('daemon'), pkg('small')], recordOf({ daemon: 660, small: 20 }), options)
  const shards = plan.jobs.filter((job) => job.shard !== undefined)
  assertEquals(shards.map((job) => `${job.shard?.index}/${job.shard?.count}`), ['1/3', '2/3', '3/3'])
  assert(shards.every((job) => job.predicted <= 300))
  assertEquals(plan.merges, [{ package: '@s/daemon', dir: 'packages/daemon', slug: 'daemon', count: 3 }])
})

Deno.test('a package with no measurement is still planned, at the unknown default', () => {
  const plan = planJobs([pkg('new')], emptyRecord, options)
  assertEquals(plan.jobs.map((job) => [job.packages, job.predicted]), [[['@s/new'], 60]])
})

Deno.test('whole-package jobs grow past the target rather than exceed the job budget', () => {
  const packages = Array.from({ length: 6 }, (_unused, i) => pkg(`p${i}`))
  const plan = planJobs(packages, recordOf(Object.fromEntries(packages.map((_p, i) => [`p${i}`, 250]))), {
    ...options,
    maxJobs: 3,
  })
  assertEquals(plan.jobs.length, 3)
})

Deno.test('a job holding a browser package is marked for the browser install', () => {
  const plan = planJobs([pkg('ui', true), pkg('core')], emptyRecord, options)
  assertEquals(plan.jobs.map((job) => job.browser), [true])
})

Deno.test('turbo cache hits and non-test tasks contribute no measurement', () => {
  const entries = entriesFromTurboSummary({
    tasks: [
      {
        task: 'test',
        package: '@s/a',
        cache: { status: 'MISS' },
        execution: { startTime: 0, endTime: 42_400, exitCode: 0 },
      },
      {
        task: 'test',
        package: '@s/b',
        cache: { status: 'HIT' },
        execution: { startTime: 0, endTime: 100, exitCode: 0 },
      },
      {
        task: 'build',
        package: '@s/a',
        cache: { status: 'MISS' },
        execution: { startTime: 0, endTime: 9_000, exitCode: 0 },
      },
    ],
  })
  assertEquals(entries, [{ package: '@s/a', seconds: 42, exitCode: 0 }])
})

const measured = (seconds: number, sha: string): Measured => ({ seconds, sha })

Deno.test('a package this run did not measure keeps its previous duration', () => {
  const merged = mergeRecord(recordOf({ a: 100, b: 200 }), [{
    job: 'g',
    entries: [{ package: '@s/a', seconds: 90, exitCode: 0 }],
  }], 'new')
  assertEquals(merged.packages, { '@s/a': measured(90, 'new'), '@s/b': measured(200, 'old') })
})

Deno.test('a sharded package is measured as the sum of its shards when all reported', () => {
  const parts: Part[] = [1, 2, 3].map((index) => ({
    job: `d-${index}`,
    entries: [{ package: '@s/d', seconds: 100 + index, exitCode: 0, shard: { index, count: 3 } }],
  }))
  assertEquals(mergeRecord(emptyRecord, parts, 'new').packages['@s/d'], measured(306, 'new'))
})

Deno.test('a sharded package missing a shard keeps its previous duration', () => {
  const parts: Part[] = [1, 2].map((index) => ({
    job: `d-${index}`,
    entries: [{ package: '@s/d', seconds: 100, exitCode: 0, shard: { index, count: 3 } }],
  }))
  assertEquals(mergeRecord(recordOf({ d: 660 }), parts, 'new').packages['@s/d'], measured(660, 'old'))
})
