import { assert, assertEquals, assertRejects, assertThrows } from '@std/assert'
import { join } from '@std/path'
import {
  combineParts,
  incrementalFileOf,
  labelOf,
  plannedPackages,
  runJob,
  type RunPackage,
  type StagedPart,
} from './mutation-job.ts'
import type { Job, Part } from './test-timings.ts'

const REPORT = (files: readonly string[]) => ({
  schemaVersion: '1.0',
  thresholds: { high: 100, low: 80 },
  files: Object.fromEntries(files.map((file) => [file, { language: 'typescript', source: '', mutants: [] }])),
})

const groupJob: Job = {
  id: 'group-1',
  name: 'a, b',
  packages: ['@s/a', '@s/b'],
  dirs: ['packages/a', 'packages/b'],
  filters: '--filter=@s/a --filter=@s/b',
  browser: false,
  predicted: 600,
}

const shardJob: Job = {
  id: 'c-2',
  name: 'c 2/3',
  packages: ['@s/c'],
  dirs: ['packages/c'],
  filters: '--filter=@s/c',
  browser: false,
  predicted: 700,
  shard: { index: 2, count: 3, package: '@s/c', dir: 'packages/c', slug: 'c' },
}

/** A Stryker stand-in: writes a report and an incremental file unless told the package crashes. */
const fakeStryker = (root: string, crashes: ReadonlySet<string>, caps: Map<string, number>): RunPackage =>
async (
  { name, dir, incrementalFile, capSeconds },
) => {
  caps.set(name, capSeconds)
  if (crashes.has(name)) return 1
  await Deno.mkdir(join(root, dir, 'reports', 'mutation'), { recursive: true })
  await Deno.writeTextFile(
    join(root, dir, 'reports', 'mutation', 'mutation.json'),
    JSON.stringify(REPORT([`src/${name}.ts`])),
  )
  await Deno.writeTextFile(join(root, dir, incrementalFile), '{}')
  return 0
}

/** Every clock read advances 90 s, so each package measures 90 s. */
const runIn = async (job: Job, crashes: ReadonlySet<string>, budgetSeconds = 3600) => {
  const root = await Deno.makeTempDir()
  const caps = new Map<string, number>()
  let now = 0
  const result = await runJob(job, {
    root,
    run: fakeStryker(root, crashes, caps),
    capSeconds: 1800,
    budgetSeconds,
    clock: () => (now += 90_000),
    log: () => {},
  })
  return { root, caps, ...result }
}

Deno.test('a package runs under what is left of the budget, and one it no longer covers is skipped', async () => {
  // budget 250 s: the job starts at 90 s, package a at 180 s with 160 s left, b at 360 s with none.
  const { root, caps, ok } = await runIn(groupJob, new Set(), 250)
  assertEquals([...caps], [['@s/a', 160]])
  assertEquals(ok, false)
  const part = JSON.parse(await Deno.readTextFile(join(root, '.timings', 'group-1.json'))) as Part
  assertEquals(part.entries.map((entry) => entry.package), ['@s/a'])
  const skipped = join(root, 'mutation-parts', 'packages-b', 'whole', 'mutation-part.json')
  assertEquals(JSON.parse(await Deno.readTextFile(skipped)).outcome, 'failure')
  await Deno.remove(root, { recursive: true })
})

Deno.test('a job killed mid-way has already recorded every package it finished', async () => {
  const root = await Deno.makeTempDir()
  const finish = fakeStryker(root, new Set(), new Map())
  let now = 0
  await assertRejects(() =>
    runJob(groupJob, {
      root,
      run: (run) => (run.name === '@s/b' ? Promise.reject(new Error('runner timeout')) : finish(run)),
      capSeconds: 1800,
      budgetSeconds: 3600,
      clock: () => (now += 90_000),
      log: () => {},
    })
  )
  const part = JSON.parse(await Deno.readTextFile(join(root, '.timings', 'group-1.json'))) as Part
  assertEquals(part.entries.map((entry) => entry.package), ['@s/a'])
  await Deno.remove(root, { recursive: true })
})

const exists = async (path: string): Promise<boolean> => {
  try {
    await Deno.stat(path)
    return true
  } catch {
    return false
  }
}

Deno.test('a job runs every package even after one crashes, then fails for the missing report', async () => {
  const { root, ok } = await runIn(groupJob, new Set(['@s/a']))
  assertEquals(ok, false)
  const part = JSON.parse(await Deno.readTextFile(join(root, '.timings', 'group-1.json'))) as Part
  assertEquals(part.entries.map((entry) => [entry.package, entry.exitCode, entry.seconds]), [
    ['@s/a', 1, 90],
    ['@s/b', 0, 90],
  ])
  assert(await exists(join(root, 'mutation-parts', 'packages-b', 'whole', 'mutation-report.json')))
  assert(!(await exists(join(root, 'mutation-parts', 'packages-a', 'whole', 'mutation-report.json'))))
  assertEquals(
    JSON.parse(await Deno.readTextFile(join(root, 'mutation-parts', 'packages-a', 'whole', 'mutation-part.json'))),
    { package: 'packages/a', outcome: 'failure' },
  )
  await Deno.remove(root, { recursive: true })
})

Deno.test('a job whose packages all report passes', async () => {
  const { root, ok } = await runIn(groupJob, new Set())
  assertEquals(ok, true)
  await Deno.remove(root, { recursive: true })
})

Deno.test('a shard keeps its own incremental file and records its shard', async () => {
  const { root, ok } = await runIn(shardJob, new Set())
  assertEquals(ok, true)
  assert(await exists(join(root, 'incremental', 'packages/c', 'reports', 'stryker-incremental-2of3.json')))
  const part = JSON.parse(await Deno.readTextFile(join(root, '.timings', 'c-2.json'))) as Part
  assertEquals(part.entries[0]?.shard, { index: 2, count: 3 })
  assertEquals(
    JSON.parse(await Deno.readTextFile(join(root, 'mutation-parts', 'packages-c', '2of3', 'mutation-part.json'))).shard,
    { index: 2, count: 3 },
  )
  await Deno.remove(root, { recursive: true })
})

Deno.test('incremental files and labels name the shard only when there is one', () => {
  assertEquals(incrementalFileOf(undefined), 'reports/stryker-incremental.json')
  assertEquals(incrementalFileOf({ index: 1, count: 4 }), 'reports/stryker-incremental-1of4.json')
  assertEquals(labelOf('packages/a', undefined), 'packages/a')
  assertEquals(labelOf('packages/a', { index: 3, count: 4 }), 'packages/a (3/4)')
})

const shardPart = (
  index: number,
  count: number,
  files: readonly string[] | null,
  outcome: 'success' | 'failure' = 'success',
): StagedPart => ({
  meta: { package: 'packages/c', outcome, shard: { index, count } },
  ...(files === null ? {} : { report: REPORT(files) }),
  stream: `{"kind":"mutant","shard":${index}}\n`,
})

Deno.test("every shard of a package folds into one report holding every shard's files", () => {
  const combined = combineParts([shardPart(2, 2, ['src/b.ts']), shardPart(1, 2, ['src/a.ts'])])
  const part = combined.get('packages/c')
  assertEquals(part?.meta, { package: 'packages/c', outcome: 'success' })
  assertEquals(Object.keys(part?.report?.files ?? {}).sort(), ['src/a.ts', 'src/b.ts'])
})

Deno.test('a failed shard fails its package', () => {
  const combined = combineParts([shardPart(1, 2, ['src/a.ts'], 'failure'), shardPart(2, 2, ['src/b.ts'])])
  assertEquals(combined.get('packages/c')?.meta.outcome, 'failure')
})

Deno.test('a package missing a shard keeps only its streams, so the merge marks it incomplete', () => {
  const part = combineParts([shardPart(1, 3, ['src/a.ts']), shardPart(3, 3, ['src/c.ts'])]).get('packages/c')
  assertEquals(part?.report, undefined)
  assertEquals(part?.stream?.trimEnd().split('\n').length, 2)
})

Deno.test('a shard that produced no report leaves its package without one', () => {
  const part = combineParts([shardPart(1, 2, ['src/a.ts']), shardPart(2, 2, null)]).get('packages/c')
  assertEquals(part?.report, undefined)
})

Deno.test('shards from two different shard counts never make a package complete', () => {
  const part = combineParts([shardPart(1, 2, ['src/a.ts']), shardPart(2, 3, ['src/b.ts'])]).get('packages/c')
  assertEquals(part?.report, undefined)
})

Deno.test('two shards that mutated the same file are refused, naming it', () => {
  assertThrows(
    () => combineParts([shardPart(1, 2, ['src/a.ts']), shardPart(2, 2, ['src/a.ts'])]),
    Error,
    'shards 1 and 2 both mutated src/a.ts',
  )
})

Deno.test('a whole package passes through with its report', () => {
  const combined = combineParts([{ meta: { package: 'packages/a', outcome: 'success' }, report: REPORT(['src/a.ts']) }])
  assertEquals(Object.keys(combined.get('packages/a')?.report?.files ?? {}), ['src/a.ts'])
})

Deno.test('the planned packages are every job directory, once', () => {
  assertEquals(plannedPackages([groupJob, shardJob, { ...shardJob, id: 'c-1' }]), [
    'packages/a',
    'packages/b',
    'packages/c',
  ])
})
