// mutation-shard-plan - the decisions behind the Mutation lane's shard plan: the seed's rate chain, the
// `stryker plan --target-seconds` sizing (seed-priced and record-priced), the lone-shard dry-run split, the
// wall estimate of every planned shard, and the batch packing of one-shard projects. Nothing above the shell
// reads a file or runs a process (CONST-B1); the two commands below are the thin shell that does.
//
//   mutation-shard-plan project --label <dir> --name <pkg> --slug <slug> --seed <path> --target <s> --overhead <s>
//     --runners <n> --rows <file>
//     sizes one selected project's shards: prices the seed's seconds per mutant for it, runs the
//     `stryker plan` passes the pricing decision needs (its incremental records moved aside, then restored),
//     re-plans at a corrected target when the CLI's price for an unmeasured mutant is not the conversion's one
//     second and a shard would run over the target, and appends the project's row to --rows.
//   mutation-shard-plan shape --rows <file> --target <s>
//     packs the one-shard projects first-fit into batch jobs by their wall estimate, writes the job matrix
//     (shards, merges, batches, planned, shard-count) to $GITHUB_OUTPUT, prints one line per batch, and writes
//     each merged project's coverage plan beside its plan file.
//
// Every wall estimate is priced from the plan's own reported predictedSeconds, so a CLI pricing change re-plans
// at a corrected target instead of over-packing a shard past the job's 60-minute backstop.

import { parseArgs } from '@std/cli/parse-args'
import { expandGlob } from '@std/fs/expand-glob'
import { basename, join } from '@std/path'
import { arrayOf, objectOf, plannedIdsOf } from './mutation-plan.ts'
import { measuredIdsOf, type Pricing, pricingOf } from './record-pricing.ts'

const numberOf = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null

// --- the seed's rate chain ---

export type SeedCosts = { readonly projects: Readonly<Record<string, { seconds: number; mutants: number }>> }

/** A loose decode of the seed costs file; an entry prices only when both its numbers are positive. */
export const seedCostsOf = (raw: unknown): SeedCosts => {
  const projects: Record<string, { seconds: number; mutants: number }> = {}
  for (const [label, entry] of Object.entries(objectOf(objectOf(raw).projects))) {
    const seconds = numberOf(objectOf(entry).seconds)
    const mutants = numberOf(objectOf(entry).mutants)
    if (seconds !== null && mutants !== null) projects[label] = { seconds, mutants }
  }
  return { projects }
}

const ratesOf = (seed: SeedCosts): readonly number[] =>
  Object.values(seed.projects).flatMap((
    { seconds, mutants },
  ) => (seconds > 0 && mutants > 0 ? [seconds / mutants] : []))

/** The slowest positive seconds-per-mutant the seed measures; one second when it measures none. */
export const slowestRateOf = (seed: SeedCosts): number => {
  const rates = ratesOf(seed)
  return rates.length === 0 ? 1 : Math.max(...rates)
}

/**
 * Seconds one of `label`'s mutants takes: its own seeded seconds per mutant; else the seed's slowest rate; else,
 * with no seed file, one second. A seed whose file is missing prices nothing, so the plan still packs at a price
 * and the lane runs.
 */
export const seedRateOf = (seed: SeedCosts | null, label: string): { rate: number; source: string } => {
  if (seed === null) return { rate: 1, source: 'no seed costs file: one second per mutant' }
  const entry = seed.projects[label]
  const slowest = slowestRateOf(seed)
  if (entry === undefined) {
    return { rate: slowest, source: 'slowest seconds per mutant in the seed (no measurement of this project)' }
  }
  if (entry.mutants <= 0 || entry.seconds <= 0) {
    return {
      rate: slowest,
      source:
        `slowest seconds per mutant in the seed (this project's entry, ${entry.seconds}s over ${entry.mutants} mutants, gives no rate)`,
    }
  }
  return {
    rate: entry.seconds / entry.mutants,
    source: `seconds per mutant in the seed (${entry.seconds}s over ${entry.mutants} mutants)`,
  }
}

// --- shard sizing ---

/**
 * The `--target-seconds` of the first `stryker plan` pass, priced by the seed: as many mutant-seconds as the
 * target holds at the seed rate. The CLI prices an unmeasured mutant at one second, so this is also the number
 * of mutants a shard holds; at least one, so a rate over the target still plans.
 */
export const seedPlanTargetOf = (target: number, overhead: number, rate: number): number =>
  Math.max(1, Math.floor((target - overhead) / rate))

/** Whether one mutant at `rate` costs more than the target holds, so every shard runs one mutant over it. */
export const mutantOverTarget = (target: number, overhead: number, rate: number): boolean =>
  Math.floor((target - overhead) / rate) < 1

/**
 * The `--target-seconds` of the record-priced pass: the test time a shard may plan, so its wall time
 * (test time plus the costliest mutant's, over the runners) fits the target. When even the costliest mutant
 * alone exceeds that, the target is the costliest mutant's own seconds and `overPriced` names the over.
 */
export const recordPlanTargetOf = (
  target: number,
  overhead: number,
  runners: number,
  cmax: number,
): { targetSeconds: number; overPriced: boolean } => {
  const seconds = (target - overhead) * runners - cmax
  return seconds < 1 ? { targetSeconds: cmax, overPriced: true } : { targetSeconds: seconds, overPriced: false }
}

/** The costliest mutant's whole seconds and id across the records, and the slowest recorded dry-run seconds. */
export const recordFactsOf = (records: readonly unknown[]): { cmax: number; cmaxId: string; dry: number | null } => {
  let costliest: { ms: number; id: string } | null = null
  for (const record of records) {
    for (const [id, entry] of Object.entries(objectOf(objectOf(record).costs))) {
      const ms = numberOf(objectOf(entry).actualMs) ?? numberOf(objectOf(entry).predictedMs) ?? 0
      if (costliest === null || ms > costliest.ms) costliest = { ms, id }
    }
  }
  let dry: number | null = null
  for (const record of records) {
    const coverage = objectOf(record).dryRunCoverage
    if (coverage === null || typeof coverage !== 'object') continue
    const cov = objectOf(coverage)
    const spent = arrayOf(cov.tests).reduce<number>((sum, test) => sum + (numberOf(objectOf(test).timeSpentMs) ?? 0), 0)
    const seconds = ((numberOf(cov.timeOverheadMs) ?? 0) + spent) / 1000
    if (dry === null || seconds > dry) dry = seconds
  }
  return { cmax: costliest === null ? 0 : Math.ceil(costliest.ms / 1000), cmaxId: costliest?.id ?? '', dry }
}

/**
 * The re-plan target of a lone shard whose recorded dry run would push its wall time past the target
 * (`overhead + dry + (planned + costliest) / runners > target`): half the planned seconds, so the shards reuse
 * the coverage dry run instead of one shard running over. Zero when nothing splits.
 */
export const loneShardSplitOf = (
  plan: unknown,
  opts: { target: number; overhead: number; runners: number; cmax: number; dry: number | null },
): number => {
  const shards = arrayOf(objectOf(plan).shards)
  const planned = shards.reduce<number>((sum, shard) => sum + (numberOf(objectOf(shard).predictedSeconds) ?? 0), 0)
  if (shards.length !== 1 || opts.dry === null) return 0
  if (!(opts.overhead + opts.dry + (planned + opts.cmax) / opts.runners > opts.target)) return 0
  return Math.max(Math.ceil(planned / 2), 1)
}

// --- wall estimates from the plan's own reported seconds ---

const mutantsOf = (plan: unknown): number =>
  arrayOf(objectOf(plan).shards).reduce<number>(
    (sum, shard) =>
      sum +
      arrayOf(objectOf(shard).projects).reduce<number>(
        (n, project) => n + arrayOf(objectOf(project).mutants).length,
        0,
      ),
    0,
  )

/**
 * The seconds per mutant the CLI really priced an unmeasured mutant at: the plan's total predictedSeconds over
 * its total mutants. Null when the plan reports no mutant or no predicted seconds, so a price cannot be observed.
 */
export const observedPriceOf = (plan: unknown): number | null => {
  const mutants = mutantsOf(plan)
  const predicted = arrayOf(objectOf(plan).shards).reduce<number>(
    (sum, shard) => sum + (numberOf(objectOf(shard).predictedSeconds) ?? 0),
    0,
  )
  return mutants > 0 && predicted > 0 ? predicted / mutants : null
}

export type ShardPricing =
  | { readonly mode: 'seed'; readonly rate: number; readonly overhead: number; readonly observedPrice: number | null }
  | {
    readonly mode: 'record'
    readonly overhead: number
    readonly runners: number
    readonly cmax: number
    readonly dry: number | null
  }

/**
 * The wall seconds each planned shard is estimated to run, one entry per shard, in the plan's shard order.
 * A seed-priced shard runs its predictedSeconds at the seed rate over the observed price (one second when the
 * price cannot be observed); a record-priced shard runs its predictedSeconds plus the costliest mutant's, over
 * the runners, and a lone shard also runs the dry run.
 */
export const shardWallsOf = (plan: unknown, pricing: ShardPricing): readonly number[] => {
  const shards = arrayOf(objectOf(plan).shards)
  const alone = shards.length === 1
  const price = pricing.mode === 'seed' ? (pricing.observedPrice ?? 1) : 0
  return shards.map((shard) => {
    const predicted = numberOf(objectOf(shard).predictedSeconds) ?? 0
    if (pricing.mode === 'seed') return Math.ceil(pricing.overhead + predicted * pricing.rate / price)
    const dry = alone ? (pricing.dry ?? 0) : 0
    return Math.ceil(pricing.overhead + dry + (predicted + pricing.cmax) / pricing.runners)
  })
}

/**
 * The seed conversion's target corrected for the price the CLI really charged: at `observedPrice` seconds per
 * unmeasured mutant, a shard holds `target-seconds / observedPrice` mutants, which at the seed rate must fit the
 * target's wall seconds. At least one.
 */
export const correctedSeedTargetOf = (target: number, overhead: number, rate: number, observedPrice: number): number =>
  Math.max(1, Math.floor((target - overhead) * observedPrice / rate))

/**
 * The over-pack guard of a seed-priced plan (CONST-T3: a CLI pricing change must not silently pack a shard past
 * the target). Returns the corrected `--target-seconds` to re-plan at when the CLI's observed price is not the
 * conversion's one second and a shard's wall estimate runs over the target; null when the plan already fits or
 * the price cannot be observed.
 */
export const seedReplannedTargetOf = (
  plan: unknown,
  opts: { target: number; overhead: number; rate: number },
): number | null => {
  const price = observedPriceOf(plan)
  if (price === null || price === 1) return null
  const walls = shardWallsOf(plan, { mode: 'seed', rate: opts.rate, overhead: opts.overhead, observedPrice: price })
  if (walls.length === 0 || Math.max(...walls) <= opts.target) return null
  return correctedSeedTargetOf(opts.target, opts.overhead, opts.rate, price)
}

// --- the project's row and the job matrix ---

export interface PlanRow {
  readonly slug: string
  readonly label: string
  readonly name: string
  readonly mutants: number
  readonly remembered: number
  readonly fresh: number
  readonly predicted: number
  readonly n: number
  readonly estimate: number
  readonly total: number
  readonly source: string
}

/** The mutant ids the restored records already hold, counted over the plan's listed ids. */
export const rememberedOf = (plan: unknown, records: readonly unknown[]): number => {
  const known = new Set(
    records.flatMap((record) =>
      Object.values(objectOf(objectOf(record).files)).flatMap((file) =>
        arrayOf(objectOf(file).mutants).flatMap((mutant) => {
          const id = objectOf(mutant).id
          return typeof id === 'string' ? [id] : []
        })
      )
    ),
  )
  return arrayOf(objectOf(plan).shards).reduce<number>(
    (sum, shard) =>
      sum + arrayOf(objectOf(shard).projects).reduce<number>(
        (n, project) => n + arrayOf(objectOf(project).mutants).filter((id) => known.has(String(id))).length,
        0,
      ),
    0,
  )
}

/** The row the plan step appends and the shape step packs: counts, wall estimates and the pricing source. */
export const rowOf = (
  plan: unknown,
  facts: { slug: string; label: string; name: string; source: string },
  records: readonly unknown[],
  pricing: ShardPricing,
): PlanRow => {
  const mutants = mutantsOf(plan)
  const walls = shardWallsOf(plan, pricing)
  const remembered = rememberedOf(plan, records)
  return {
    slug: facts.slug,
    label: facts.label,
    name: facts.name,
    mutants,
    remembered,
    fresh: mutants - remembered,
    predicted: Math.ceil(
      arrayOf(objectOf(plan).shards).reduce<number>(
        (sum, shard) => sum + (numberOf(objectOf(shard).predictedSeconds) ?? 0),
        0,
      ),
    ),
    n: arrayOf(objectOf(plan).shards).length,
    estimate: walls.length === 0 ? 0 : Math.max(...walls),
    total: walls.reduce((sum, wall) => sum + wall, 0),
    source: facts.source,
  }
}

export interface Shaped {
  readonly shards: ReadonlyArray<{ slug: string; label: string; name: string; k: number; n: number; minutes: number }>
  readonly merges: ReadonlyArray<{ slug: string; label: string; name: string; n: number; minutes: number }>
  readonly batches: ReadonlyArray<{
    id: number
    load: number
    minutes: number
    projects: ReadonlyArray<Pick<PlanRow, 'slug' | 'label' | 'name' | 'mutants' | 'fresh' | 'remembered' | 'predicted'>>
  }>
  readonly planned: ReadonlyArray<{ slug: string; label: string; name: string }>
  readonly shardCount: number
}

const emptyShaped = (rows: readonly PlanRow[]): Shaped => ({
  shards: [],
  merges: [],
  batches: [],
  planned: rows.map(({ slug, label, name }) => ({ slug, label, name })),
  shardCount: 0,
})

/**
 * The job matrix of a run's rows: sharded projects become shard jobs and merges, one-shard projects are packed
 * longest-first into batch jobs whose load fits the target, and every project is planned. Two projects may not
 * share a slug, and no slug may start with `batch-`, so artifact names stay unique; `error` names the first fault.
 */
export const shapeOf = (rows: readonly PlanRow[], target: number): { shaped: Shaped; error: string | null } => {
  const bySlug = new Map<string, string[]>()
  for (const row of rows) bySlug.set(row.slug, [...(bySlug.get(row.slug) ?? []), row.label])
  const colliding = [...bySlug].filter(([, labels]) => labels.length > 1)
  if (colliding.length > 0) {
    return {
      shaped: emptyShaped(rows),
      error: `two projects share a mutation slug, so their artifacts would collide: ${
        colliding.map(([slug, labels]) => `${slug}: ${labels.join(', ')}`).join(', ')
      }. Next: rename one project directory.`,
    }
  }
  const reserved = rows.filter((row) => row.slug.startsWith('batch-')).map((row) => row.label)
  if (reserved.length > 0) {
    return {
      shaped: emptyShaped(rows),
      error: `a project slug starting with batch- would collide with the batch jobs' artifact names: ${
        reserved.join(', ')
      }. Next: rename the project directory.`,
    }
  }
  const sharded = rows.filter((row) => row.n >= 2)
  const bins: Array<{ load: number; projects: PlanRow[] }> = []
  for (const row of [...rows.filter((row) => row.n === 1)].sort((a, b) => b.estimate - a.estimate)) {
    const at = bins.findIndex((bin) => bin.load + row.estimate <= target)
    if (at === -1) bins.push({ load: row.estimate, projects: [row] })
    else {
      bins[at]!.load += row.estimate
      bins[at]!.projects.push(row)
    }
  }
  const pick = ({ slug, label, name, mutants, fresh, remembered, predicted }: PlanRow) => ({
    slug,
    label,
    name,
    mutants,
    fresh,
    remembered,
    predicted,
  })
  return {
    shaped: {
      shards: sharded.flatMap((row) =>
        Array.from({ length: row.n }, (_unused, i) => ({
          slug: row.slug,
          label: row.label,
          name: row.name,
          k: i + 1,
          n: row.n,
          minutes: Math.ceil(row.total / 60),
        }))
      ),
      merges: sharded.map((row) => ({
        slug: row.slug,
        label: row.label,
        name: row.name,
        n: row.n,
        minutes: Math.ceil(row.total / 60),
      })),
      batches: bins.map((bin, i) => ({
        id: i + 1,
        load: bin.load,
        minutes: Math.ceil(bin.load / 60),
        projects: bin.projects.map(pick),
      })),
      planned: rows.map(({ slug, label, name }) => ({ slug, label, name })),
      shardCount: sharded.reduce((sum, row) => sum + row.n, 0),
    },
    error: null,
  }
}

// --- the thin shell ---

const runStrykerPlan = async (label: string, targetSeconds: number, out: string): Promise<number> => {
  const child = new Deno.Command('pnpm', {
    args: ['exec', 'stryker', 'plan', '--projects', label, '--target-seconds', String(targetSeconds), '--out', out],
    stdin: 'null',
    stdout: 'inherit',
    stderr: 'inherit',
  }).spawn()
  return (await child.status).code
}

const readJson = async (path: string): Promise<unknown> => JSON.parse(await Deno.readTextFile(path))

const positiveInt = (value: unknown, flag: string): number => {
  const n = Number(value)
  if (value === undefined || value === '' || !Number.isInteger(n) || n <= 0) {
    throw new Error(`--${flag} needs a positive integer, got '${String(value)}'`)
  }
  return n
}

const project = async (args: {
  label: string
  name: string
  slug: string
  seed: string
  target: number
  overhead: number
  runners: number
  rows: string
  plan: string
}): Promise<number> => {
  let seed: SeedCosts | null = null
  try {
    seed = seedCostsOf(await readJson(args.seed))
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) {
      throw new Error(`the seed costs ${args.seed} do not parse: ${(error as Error).message}`)
    }
  }
  const { rate, source } = seedRateOf(seed, args.label)
  if (mutantOverTarget(args.target, args.overhead, rate)) {
    console.log(
      `::warning::${args.label}: one mutant costs ${rate}s (cost source: ${source}), over the ${args.target}s target, so each shard holds one mutant and runs over it.`,
    )
  }
  const records: string[] = []
  for (
    const pattern of [
      `${args.label}/reports/stryker-incremental.json`,
      `${args.label}/reports/stryker-incremental-*.json`,
    ]
  ) {
    for await (const entry of expandGlob(pattern)) {
      if (entry.isFile) records.push(entry.path)
    }
  }
  records.sort()
  const parsed = await Promise.all(records.map(async (path) => {
    try {
      return await readJson(path)
    } catch (error) {
      throw new Error(`the incremental record ${path} does not parse: ${(error as Error).message}`)
    }
  }))

  const hidden = await Deno.makeTempDir({ prefix: 'mutation-records-' })
  try {
    // Without a record the planner prices every mutant at one second, so the target is the number of mutants a
    // shard can hold; the records are moved aside so they price nothing.
    const aside = async (): Promise<void> => {
      for (const record of records) await Deno.rename(record, join(hidden, basename(record)))
    }
    const restore = async (): Promise<void> => {
      for (const record of records) await Deno.rename(join(hidden, basename(record)), record)
    }
    await aside()
    try {
      const code = await runStrykerPlan(args.label, seedPlanTargetOf(args.target, args.overhead, rate), args.plan)
      if (code !== 0) return code
    } finally {
      await restore()
    }

    let plan = await readJson(args.plan)
    let priced: Pricing | null = parsed.length > 0 ? pricingOf(plannedIdsOf(plan), measuredIdsOf(parsed)) : null
    let pricing: ShardPricing
    let rowSource = source
    if (priced !== null && priced._tag === 'Record') {
      const { cmax, cmaxId, dry } = recordFactsOf(parsed)
      const sized = recordPlanTargetOf(args.target, args.overhead, args.runners, cmax)
      if (sized.overPriced) {
        console.log(
          `::warning::${args.label}: mutant ${cmaxId} costs ${cmax}s of test time, over the ${args.target}s target, so its shard runs over it. Next: split the file that mutant lives in, or make the slowest test covering it faster.`,
        )
      }
      if (await runStrykerPlan(args.label, sized.targetSeconds, args.plan) !== 0) return 1
      plan = await readJson(args.plan)
      const split = loneShardSplitOf(plan, {
        target: args.target,
        overhead: args.overhead,
        runners: args.runners,
        cmax,
        dry,
      })
      if (split > 0 && await runStrykerPlan(args.label, split, args.plan) !== 0) return 1
      plan = await readJson(args.plan)
      rowSource = `incremental record(s) ${records.join(' ')}, measuring all ${priced.planned} planned mutants`
      pricing = { mode: 'record', overhead: args.overhead, runners: args.runners, cmax, dry }
    } else {
      if (priced !== null) {
        rowSource = `${source}; the record measured ${priced.measured} of ${priced.planned} planned mutants`
      }
      const first = seedPlanTargetOf(args.target, args.overhead, rate)
      const corrected = seedReplannedTargetOf(plan, { target: args.target, overhead: args.overhead, rate })
      if (corrected !== null && corrected < first) {
        const price = observedPriceOf(plan)
        await aside()
        try {
          if (await runStrykerPlan(args.label, corrected, args.plan) !== 0) return 1
        } finally {
          await restore()
        }
        plan = await readJson(args.plan)
        console.log(
          `::warning::${args.label}: stryker priced an unmeasured mutant at ${price}s, not the conversion's 1s, so a shard held more mutants than the ${args.target}s target fits; re-planned at ${corrected} target-seconds.`,
        )
      }
      pricing = { mode: 'seed', rate, overhead: args.overhead, observedPrice: observedPriceOf(plan) }
    }

    const row = rowOf(plan, { slug: args.slug, label: args.label, name: args.name, source: rowSource }, parsed, pricing)
    if (row.mutants === 0) {
      console.log(
        `::error::${args.label}: planned 0 mutants, new or remembered, so mutation has nothing to gate. Next: check the project's stryker config mutate globs, or drop its mutation script.`,
      )
      return 1
    }
    if (row.estimate > args.target) {
      console.log(
        `::warning::${args.label}: a planned shard costs ${row.estimate}s, over the ${args.target}s target (cost source: ${rowSource}); it runs anyway, under the 60-minute job timeout. Next: fix the cost at its cause, the slow mutant or test.`,
      )
    }
    await Deno.writeTextFile(args.rows, JSON.stringify(row) + '\n', { append: true })
    console.log(
      `${args.label}: ${row.mutants} mutants (${row.fresh} new, ${row.remembered} in the record, ${row.predicted}s to test) in ${row.n} shard(s), max shard ${row.estimate}s (${rowSource})`,
    )
    return 0
  } finally {
    await Deno.remove(hidden, { recursive: true })
  }
}

const shape = async (args: { rows: string; target: number }): Promise<number> => {
  let rows: PlanRow[] = []
  try {
    const text = await Deno.readTextFile(args.rows)
    rows = text.split('\n').filter((line) => line !== '').map((line) => JSON.parse(line) as PlanRow)
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error
  }
  const { shaped, error } = shapeOf(rows, args.target)
  if (error !== null) {
    console.log(`::error::${error}`)
    return 1
  }
  for (const merge of shaped.merges) {
    const plan = objectOf(await readJson(`mutation-plan-${merge.slug}.json`))
    const first = objectOf(arrayOf(objectOf(arrayOf(plan.shards)[0]).projects)[0])
    const coverage = {
      ...plan,
      shards: [{ index: 1, count: 1, predictedSeconds: 0, projects: [{ project: first.project, mutants: [] }] }],
      matrix: { ...objectOf(plan.matrix), include: [{ shard: '1/1', predictedSeconds: 0 }] },
    }
    await Deno.writeTextFile(`mutation-coverage-${merge.slug}.json`, JSON.stringify(coverage, null, 2) + '\n')
  }
  for (const batch of shaped.batches) {
    console.log(`batch ${batch.id}: ${batch.load}s · ${batch.projects.map((project) => project.label).join(', ')}`)
  }
  const lines = [
    `planned=${JSON.stringify(shaped.planned)}`,
    `shards=${JSON.stringify(shaped.shards)}`,
    `merges=${JSON.stringify(shaped.merges)}`,
    `batches=${JSON.stringify(shaped.batches)}`,
    `shard-count=${shaped.shardCount}`,
  ].map((line) => line + '\n').join('')
  const output = Deno.env.get('GITHUB_OUTPUT')
  if (output === undefined) console.log(lines)
  else await Deno.writeTextFile(output, lines, { append: true })
  return 0
}

const main = async (): Promise<number> => {
  const [command, ...rest] = Deno.args
  const args = parseArgs(rest, { string: ['label', 'name', 'slug', 'seed', 'rows', 'plan'] })
  if (command === 'project') {
    for (const flag of ['label', 'name', 'slug', 'seed', 'rows'] as const) {
      if (args[flag] === undefined || args[flag] === '') throw new Error(`--${flag} is required`)
    }
    return await project({
      label: args.label!,
      name: args.name!,
      slug: args.slug!,
      seed: args.seed!,
      target: positiveInt(args.target, 'target'),
      overhead: positiveInt(args.overhead, 'overhead'),
      runners: positiveInt(args.runners, 'runners'),
      rows: args.rows!,
      plan: args.plan === undefined || args.plan === '' ? `mutation-plan-${args.slug!}.json` : args.plan,
    })
  }
  if (command === 'shape') {
    return await shape({ rows: args.rows ?? 'mutation-projects.jsonl', target: positiveInt(args.target, 'target') })
  }
  throw new Error(`unknown command ${command ?? '(none)'}: expected project or shape`)
}

if (import.meta.main) Deno.exit(await main())
