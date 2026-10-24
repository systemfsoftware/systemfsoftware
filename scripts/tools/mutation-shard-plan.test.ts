// mutation-shard-plan.test.ts - the shard sizing, rate chain and batch packing decisions of
// mutation-shard-plan.ts, against fixtures a CLI pricing change or a costlier record moves (CONST-T3: every
// decision here has an input that flips it).
import { assertEquals } from '@std/assert'
import { dirname, fromFileUrl, join } from '@std/path'
import {
  correctedSeedTargetOf,
  loneShardSplitOf,
  mutantOverTarget,
  observedPriceOf,
  type PlanRow,
  recordFactsOf,
  recordPlanTargetOf,
  rememberedOf,
  rowOf,
  seedCostsOf,
  seedPlanTargetOf,
  seedRateOf,
  seedReplannedTargetOf,
  shapeOf,
  shardWallsOf,
  slowestRateOf,
} from './mutation-shard-plan.ts'

const here = dirname(fromFileUrl(import.meta.url))

const SEED = seedCostsOf({
  projects: {
    'packages/a': { seconds: 900, mutants: 90 },
    'packages/b': { seconds: 100, mutants: 50 },
    'packages/degenerate': { seconds: 0, mutants: 10 },
  },
})

Deno.test('the seed rates a project from its own entry, else the slowest rate, else one second without a file', () => {
  assertEquals(seedRateOf(SEED, 'packages/a'), {
    rate: 10,
    source: 'seconds per mutant in the seed (900s over 90 mutants)',
  })
  assertEquals(seedRateOf(SEED, 'packages/unknown').rate, 10) // 900s over 90 mutants is the slowest valid entry
  assertEquals(
    seedRateOf(SEED, 'packages/unknown').source,
    'slowest seconds per mutant in the seed (no measurement of this project)',
  )
  assertEquals(seedRateOf(SEED, 'packages/degenerate').rate, 10)
  assertEquals(seedRateOf(null, 'packages/a'), { rate: 1, source: 'no seed costs file: one second per mutant' })
})

Deno.test('the slowest rate skips entries that give no rate, and an empty seed prices at one second', () => {
  assertEquals(slowestRateOf(SEED), 10)
  assertEquals(slowestRateOf(seedCostsOf({ projects: {} })), 1)
  assertEquals(slowestRateOf(seedCostsOf({ projects: { x: { seconds: -5, mutants: 0 } } })), 1)
})

const planOf = (shards: ReadonlyArray<{ predictedSeconds: number; mutants: readonly string[] }>) => ({
  version: 1,
  shards: shards.map((shard, i) => ({
    index: i + 1,
    count: shards.length,
    predictedSeconds: shard.predictedSeconds,
    projects: [{ project: '.', mutants: shard.mutants }],
  })),
})

Deno.test('the seed plan target is the mutant-seconds the target holds, at least one', () => {
  assertEquals(seedPlanTargetOf(600, 120, 10), 48)
  assertEquals(seedPlanTargetOf(600, 120, 4), 120)
  assertEquals(seedPlanTargetOf(600, 120, 1000), 1)
  assertEquals(mutantOverTarget(600, 120, 1000), true)
  assertEquals(mutantOverTarget(600, 120, 10), false)
})

Deno.test('the record plan target holds the costliest mutant under the wall target, and names the over', () => {
  assertEquals(recordPlanTargetOf(600, 120, 2, 60), { targetSeconds: 900, overPriced: false })
  assertEquals(recordPlanTargetOf(600, 120, 2, 2000), { targetSeconds: 2000, overPriced: true })
})

Deno.test('record facts take actualMs over predictedMs, whole seconds, and the slowest dry run', () => {
  const records = [{
    costs: {
      a: { actualMs: 1500, predictedMs: 9000 },
      b: { predictedMs: 2500 },
      c: {},
    },
    dryRunCoverage: { timeOverheadMs: 1000, tests: [{ timeSpentMs: 500 }, { timeSpentMs: 250 }, {}] },
  }, {
    costs: { d: { actualMs: 500 } },
    dryRunCoverage: { timeOverheadMs: 100, tests: [] },
  }, {
    costs: {},
  }]
  assertEquals(recordFactsOf(records), { cmax: 3, cmaxId: 'b', dry: 1.75 })
  assertEquals(recordFactsOf([{}]), { cmax: 0, cmaxId: '', dry: null })
})

Deno.test('a lone shard whose dry run pushes it over the target splits at half the planned seconds', () => {
  const lone = planOf([{ predictedSeconds: 800, mutants: ['a', 'b'] }])
  assertEquals(loneShardSplitOf(lone, { target: 600, overhead: 120, runners: 2, cmax: 60, dry: 300 }), 400)
  assertEquals(loneShardSplitOf(lone, { target: 600, overhead: 120, runners: 2, cmax: 60, dry: null }), 0)
  assertEquals(loneShardSplitOf(lone, { target: 600, overhead: 120, runners: 2, cmax: 60, dry: 1 }), 0)
  const two = planOf([{ predictedSeconds: 400, mutants: ['a'] }, { predictedSeconds: 400, mutants: ['b'] }])
  assertEquals(loneShardSplitOf(two, { target: 600, overhead: 120, runners: 2, cmax: 60, dry: 300 }), 0)
  const tiny = planOf([{ predictedSeconds: 1, mutants: ['a'] }])
  assertEquals(loneShardSplitOf(tiny, { target: 600, overhead: 120, runners: 2, cmax: 900, dry: 300 }), 1)
})

Deno.test('the observed price is the plan seconds per mutant, and is unobservable on an empty plan', () => {
  assertEquals(observedPriceOf(planOf([{ predictedSeconds: 8, mutants: ['a', 'b'] }])), 4)
  assertEquals(
    observedPriceOf(planOf([{ predictedSeconds: 3, mutants: ['a'] }, { predictedSeconds: 7, mutants: ['b'] }])),
    5,
  )
  assertEquals(observedPriceOf(planOf([{ predictedSeconds: 0, mutants: [] }])), null)
  assertEquals(observedPriceOf({}), null)
})

Deno.test('a seed-priced wall prices the plan own predictedSeconds at the seed rate over the observed price', () => {
  const plan = planOf([{ predictedSeconds: 8, mutants: ['a', 'b'] }])
  // at the CLI's real price of 4s (not the conversion's 1s) the seed rate prices each planned second 2.5x
  assertEquals(shardWallsOf(plan, { mode: 'seed', rate: 10, overhead: 120, observedPrice: 4 }), [140])
  // at the assumed 1s the wall is the mutant count at the seed rate, as before
  assertEquals(shardWallsOf(plan, { mode: 'seed', rate: 10, overhead: 120, observedPrice: 1 }), [200])
  assertEquals(shardWallsOf(plan, { mode: 'seed', rate: 10, overhead: 120, observedPrice: null }), [200])
})

Deno.test('a record-priced wall adds the costliest mutant over the runners, and a lone shard also runs the dry run', () => {
  const lone = planOf([{ predictedSeconds: 800, mutants: ['a'] }])
  assertEquals(shardWallsOf(lone, { mode: 'record', overhead: 120, runners: 2, cmax: 60, dry: 300 }), [850])
  assertEquals(shardWallsOf(lone, { mode: 'record', overhead: 120, runners: 2, cmax: 60, dry: null }), [550])
  const two = planOf([{ predictedSeconds: 800, mutants: ['a'] }, { predictedSeconds: 800, mutants: ['b'] }])
  assertEquals(shardWallsOf(two, { mode: 'record', overhead: 120, runners: 2, cmax: 60, dry: 300 }), [550, 550])
})

Deno.test('a CLI pricing change re-plans at the corrected target, and a 1s price never does', () => {
  // 240 mutants planned into one shard at the CLI's real 0.5s: the wall runs 1080s over the 600s target.
  const changed = planOf([{ predictedSeconds: 120, mutants: Array.from({ length: 240 }, (_u, i) => `m${i}`) }])
  assertEquals(observedPriceOf(changed), 0.5)
  assertEquals(seedReplannedTargetOf(changed, { target: 600, overhead: 120, rate: 4 }), 60)
  assertEquals(correctedSeedTargetOf(600, 120, 4, 0.5), 60)
  // at 60 target-seconds the CLI packs 120 mutants, whose wall is exactly the target
  const replanned = planOf([{ predictedSeconds: 60, mutants: Array.from({ length: 120 }, (_u, i) => `m${i}`) }])
  assertEquals(seedReplannedTargetOf(replanned, { target: 600, overhead: 120, rate: 4 }), null)
  // the CLI's price can also be over 1s; fewer mutants per shard never runs over
  const dearer = planOf([{ predictedSeconds: 240, mutants: ['a'] }])
  assertEquals(seedReplannedTargetOf(dearer, { target: 600, overhead: 120, rate: 4 }), null)
  assertEquals(correctedSeedTargetOf(600, 120, 4, 1), 120)
  assertEquals(correctedSeedTargetOf(600, 120, 1000, 1), 1)
})

const RECORDS = [{
  files: {
    'src/a.ts': { mutants: [{ id: 'a' }, { id: 'b' }] },
    'src/b.ts': { mutants: [{ id: 'c' }] },
  },
}]

Deno.test('remembered counts the planned ids the records hold, and the row carries counts and wall estimates', () => {
  const plan = planOf([{ predictedSeconds: 8, mutants: ['a', 'x'] }])
  assertEquals(rememberedOf(plan, RECORDS), 1)
  const row = rowOf(plan, { slug: 's', label: 'packages/s', name: '@systemfsoftware/s', source: 'src' }, RECORDS, {
    mode: 'seed',
    rate: 10,
    overhead: 120,
    observedPrice: 1,
  })
  assertEquals(row, {
    slug: 's',
    label: 'packages/s',
    name: '@systemfsoftware/s',
    mutants: 2,
    remembered: 1,
    fresh: 1,
    predicted: 8,
    n: 1,
    estimate: 200,
    total: 200,
    source: 'src',
  })
})

const row = (over: Partial<PlanRow>): PlanRow => ({
  slug: 's',
  label: 'packages/s',
  name: '@systemfsoftware/s',
  mutants: 10,
  remembered: 0,
  fresh: 10,
  predicted: 100,
  n: 1,
  estimate: 100,
  total: 100,
  source: 'src',
  ...over,
})

Deno.test('shaping expands shards, lists merges and packs one-shard projects longest-first under the target', () => {
  const rows = [
    row({
      slug: 'sharded',
      label: 'packages/sharded',
      name: '@systemfsoftware/sharded',
      n: 2,
      estimate: 400,
      total: 800,
    }),
    row({ slug: 'big', label: 'packages/big', name: '@systemfsoftware/big', estimate: 500, total: 500 }),
    row({ slug: 'mid', label: 'packages/mid', name: '@systemfsoftware/mid', estimate: 300, total: 300 }),
    row({ slug: 'small', label: 'packages/small', name: '@systemfsoftware/small', estimate: 200, total: 200 }),
  ]
  const { shaped, error } = shapeOf(rows, 600)
  assertEquals(error, null)
  assertEquals(shaped.shards, [
    { slug: 'sharded', label: 'packages/sharded', name: '@systemfsoftware/sharded', k: 1, n: 2, minutes: 14 },
    { slug: 'sharded', label: 'packages/sharded', name: '@systemfsoftware/sharded', k: 2, n: 2, minutes: 14 },
  ])
  assertEquals(shaped.merges, [
    { slug: 'sharded', label: 'packages/sharded', name: '@systemfsoftware/sharded', n: 2, minutes: 14 },
  ])
  assertEquals(
    shaped.batches.map((batch) => ({ id: batch.id, load: batch.load, projects: batch.projects.map((p) => p.slug) })),
    [
      { id: 1, load: 500, projects: ['big'] },
      { id: 2, load: 500, projects: ['mid', 'small'] },
    ],
  )
  assertEquals(shaped.batches[1]!.minutes, 9)
  assertEquals(shaped.planned.map((p) => p.slug), ['sharded', 'big', 'mid', 'small'])
  assertEquals(shaped.shardCount, 2)
})

Deno.test('shaping refuses colliding slugs and batch-prefixed slugs', () => {
  const dup = shapeOf([row({ slug: 'same', label: 'packages/a' }), row({ slug: 'same', label: 'packages/b' })], 600)
  assertEquals(
    dup.error,
    'two projects share a mutation slug, so their artifacts would collide: same: packages/a, packages/b. Next: rename one project directory.',
  )
  const reserved = shapeOf([row({ slug: 'batch-1', label: 'packages/a' })], 600)
  assertEquals(
    reserved.error,
    "a project slug starting with batch- would collide with the batch jobs' artifact names: packages/a. Next: rename the project directory.",
  )
  assertEquals(shapeOf([], 600).shaped.batches, [])
})

const deno = (cwd: string, args: readonly string[], env?: Record<string, string>) =>
  new Deno.Command(Deno.execPath(), {
    args: [
      'run',
      `--config=${join(here, '..', 'deno.jsonc')}`,
      `--lock=${join(here, '..', 'deno.lock')}`,
      '--frozen',
      '--allow-read',
      '--allow-write',
      '--allow-env',
      join(here, 'mutation-shard-plan.ts'),
      ...args,
    ],
    cwd,
    env,
    stdout: 'piped',
    stderr: 'piped',
  }).output()

Deno.test('the shape command writes the matrix to GITHUB_OUTPUT and a coverage plan beside each merge plan', async () => {
  const dir = await Deno.makeTempDir()
  try {
    const rows = [
      row({
        slug: 'sharded',
        label: 'packages/sharded',
        name: '@systemfsoftware/sharded',
        n: 2,
        total: 800,
        estimate: 400,
      }),
    ]
    await Deno.writeTextFile(join(dir, 'rows.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n')
    await Deno.writeTextFile(
      join(dir, 'mutation-plan-sharded.json'),
      JSON.stringify({
        version: 1,
        targetSeconds: 400,
        shards: [{
          index: 1,
          count: 2,
          predictedSeconds: 400,
          projects: [{ project: 'packages/sharded', mutants: ['a'] }],
        }],
        matrix: { include: [{ shard: '1/2', predictedSeconds: 400 }] },
      }),
    )
    const out = join(dir, 'github-output')
    await Deno.writeTextFile(out, '')
    const ran = await deno(dir, ['shape', '--rows', 'rows.jsonl', '--target', '600'], {
      GITHUB_OUTPUT: out,
    })
    assertEquals(ran.code, 0, new TextDecoder().decode(ran.stderr))
    const output = await Deno.readTextFile(out)
    const values = Object.fromEntries(
      output.trim().split('\n').map((line) => line.split(/=(.*)/s).slice(0, 2) as [string, string]),
    )
    assertEquals(values['shard-count'], '2')
    assertEquals(JSON.parse(values.planned!), [{
      slug: 'sharded',
      label: 'packages/sharded',
      name: '@systemfsoftware/sharded',
    }])
    assertEquals(JSON.parse(values.shards!), [
      { slug: 'sharded', label: 'packages/sharded', name: '@systemfsoftware/sharded', k: 1, n: 2, minutes: 14 },
      { slug: 'sharded', label: 'packages/sharded', name: '@systemfsoftware/sharded', k: 2, n: 2, minutes: 14 },
    ])
    const coverage = JSON.parse(await Deno.readTextFile(join(dir, 'mutation-coverage-sharded.json')))
    assertEquals(coverage, {
      version: 1,
      targetSeconds: 400,
      shards: [{ index: 1, count: 1, predictedSeconds: 0, projects: [{ project: 'packages/sharded', mutants: [] }] }],
      matrix: { include: [{ shard: '1/1', predictedSeconds: 0 }] },
    })
  } finally {
    await Deno.remove(dir, { recursive: true })
  }
})

Deno.test('the shape command fails a colliding slug naming both projects', async () => {
  const dir = await Deno.makeTempDir()
  try {
    await Deno.writeTextFile(
      join(dir, 'rows.jsonl'),
      [row({ slug: 'same', label: 'packages/a' }), row({ slug: 'same', label: 'packages/b' })]
        .map((r) => JSON.stringify(r)).join('\n') + '\n',
    )
    const ran = await deno(dir, ['shape', '--rows', 'rows.jsonl', '--target', '600'])
    assertEquals(ran.code, 1)
    assertEquals(new TextDecoder().decode(ran.stdout).includes('::error::two projects share a mutation slug'), true)
  } finally {
    await Deno.remove(dir, { recursive: true })
  }
})
