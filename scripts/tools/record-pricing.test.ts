import { assertEquals } from '@std/assert'
import { dirname, fromFileUrl, join } from '@std/path'
import { measuredIdsOf, plannedIdsOf, pricingOf } from './record-pricing.ts'

const here = dirname(fromFileUrl(import.meta.url))

// Cost entries copied from the merged incremental record of packages/npm-package that Mutation run 38105596438
// uploaded (mutation-merged-batch-1): stryker measured only the mutants a test run executed.
const MERGED_COSTS = {
  'cd71a5daf3c9bd14': { predictedMs: 30446.921050000004, actualMs: null, coveringTests: 31 }, // CompileError
  '3c8003e674fdf0a9': { predictedMs: 8876.765592, actualMs: null, coveringTests: 6 }, // CompileError
  '856fe67a4fc64e9b': { predictedMs: 2358.580698, actualMs: null, coveringTests: 0 }, // Ignored
  '1fd7a7e2561b82a1': { predictedMs: 2358.580698, actualMs: null, coveringTests: 0 }, // Ignored
  '8357db1ee7285784': { predictedMs: 8876.765592, actualMs: 3898.491067, coveringTests: 6 }, // Killed
  '4fc0d0f8edbca44c': { predictedMs: 8876.765592, actualMs: 1894.370747, coveringTests: 6 }, // Killed
  '15e0d6b08ead2ff5': { predictedMs: 2358.580698, actualMs: null, coveringTests: 0 }, // NoCoverage
  '04370fb4e0200653': { predictedMs: 2358.580698, actualMs: null, coveringTests: 0 }, // NoCoverage
  '2929f4a6e5ad10f9': { predictedMs: 8876.765592, actualMs: 15202.007722, coveringTests: 6 }, // Survived
  'e2407d48fee872df': { predictedMs: 8876.765592, actualMs: 14730.736007, coveringTests: 6 }, // Survived
}
const EXECUTED = ['8357db1ee7285784', '4fc0d0f8edbca44c', '2929f4a6e5ad10f9', 'e2407d48fee872df']
const ALL = Object.keys(MERGED_COSTS)

const planOf = (ids: readonly string[]) => ({
  version: 1,
  targetSeconds: 780,
  shards: [
    {
      index: 1,
      count: 2,
      predictedSeconds: 5,
      projects: [{ project: 'packages/npm-package', mutants: ids.slice(0, 5) }],
    },
    { index: 2, count: 2, predictedSeconds: 5, projects: [{ project: 'packages/npm-package', mutants: ids.slice(5) }] },
  ],
})

Deno.test('Should_PriceBySeed_When_TheRecordMeasuredOnlyItsExecutedMutants', () => {
  assertEquals(pricingOf(plannedIdsOf(planOf(ALL)), measuredIdsOf([{ costs: MERGED_COSTS }])), {
    _tag: 'Seed',
    measured: 4,
    planned: 10,
  })
})

Deno.test('Should_PriceByRecord_When_ThePlanListsOnlyMeasuredMutants', () => {
  assertEquals(pricingOf(plannedIdsOf(planOf(EXECUTED)), measuredIdsOf([{ costs: MERGED_COSTS }])), {
    _tag: 'Record',
    planned: 4,
  })
})

Deno.test('Should_PriceBySeed_When_ThePlanListsAMutantNewSinceTheRecord', () => {
  const planned = plannedIdsOf(planOf([...EXECUTED, '0000000000000000']))
  assertEquals(pricingOf(planned, measuredIdsOf([{ costs: MERGED_COSTS }])), {
    _tag: 'Seed',
    measured: 4,
    planned: 5,
  })
})

Deno.test('Should_PriceBySeed_When_TheRecordHoldsOnlyDryRunCoverage', () => {
  const coverageOnly = { dryRunCoverage: { tests: [{ id: '0', timeSpentMs: 2000 }] } }
  assertEquals(pricingOf(plannedIdsOf(planOf(ALL)), measuredIdsOf([coverageOnly])), {
    _tag: 'Seed',
    measured: 0,
    planned: 10,
  })
})

Deno.test('Should_CountAMutantMeasured_When_AnyOfSeveralRecordsMeasuredIt', () => {
  const unmeasured = ALL.filter((id) => !EXECUTED.includes(id))
  const second = { costs: Object.fromEntries(unmeasured.map((id) => [id, { predictedMs: 1, actualMs: 7 }])) }
  assertEquals(pricingOf(plannedIdsOf(planOf(ALL)), measuredIdsOf([{ costs: MERGED_COSTS }, second])), {
    _tag: 'Record',
    planned: 10,
  })
})

Deno.test('Should_PrintTheSourceAndCounts_When_RunAsACommand', async () => {
  const dir = await Deno.makeTempDir()
  const plan = join(dir, 'plan.json')
  const record = join(dir, 'stryker-incremental.json')
  await Deno.writeTextFile(plan, JSON.stringify(planOf(ALL)))
  await Deno.writeTextFile(record, JSON.stringify({ costs: MERGED_COSTS }))
  const run = (args: readonly string[]) =>
    new Deno.Command(Deno.execPath(), {
      args: [
        'run',
        `--config=${join(here, '..', 'deno.jsonc')}`,
        `--lock=${join(here, '..', 'deno.lock')}`,
        '--frozen',
        `--allow-read=${dir}`,
        join(here, 'record-pricing.ts'),
        ...args,
      ],
      stdout: 'piped',
      stderr: 'piped',
    }).output()
  const priced = await run(['--plan', plan, record])
  const unrecorded = await run(['--plan', plan])
  const usage = await run([record])
  await Deno.remove(dir, { recursive: true })
  const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes)
  assertEquals(
    [priced.code, text(priced.stdout), unrecorded.code, text(unrecorded.stdout), usage.code],
    [0, 'seed\t4\t10\n', 0, 'seed\t0\t10\n', 2],
  )
})
