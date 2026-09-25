#!/usr/bin/env -S deno run --allow-read --allow-write --allow-env --allow-run
// mutation-job.ts — run one planned Mutation job, and fold its parts into the report.
//
//   run      run each package of $JOB (a job from `test-timings.ts plan --task
//            mutation`) in turn under a cap: one timing part for the job, a
//            summary and report check per package, a staged report part and
//            incremental file per package. Exits 1 when a package produced no report.
//   combine  fold every shard part of a package into one `stryker merge-reports`
//            part, refusing shards that mutated the same file, and export the
//            planned packages as PACKAGES so a package with no part still gets a row.

import { parseArgs } from '@std/cli/parse-args'
import { expandGlob } from '@std/fs/expand-glob'
import { dirname, join } from '@std/path'
import { buildRequireError, buildSummary, loadState } from './build-mutation-summary.ts'
import type { Entry, Job, Part, Shard } from './test-timings.ts'

export type Outcome = 'success' | 'failure'

export type PartMeta = { readonly package: string; readonly outcome: Outcome; readonly shard?: Shard }

export type Report = { readonly files: Readonly<Record<string, unknown>>; readonly [key: string]: unknown }

export type StagedPart = { readonly meta: PartMeta; readonly report?: Report; readonly stream?: string }

export type CombinedPart = {
  readonly meta: Omit<PartMeta, 'shard'>
  readonly report?: Report
  readonly stream?: string
}

/** Runs one package's `mutation` script and resolves its exit code. */
export type RunPackage = (run: {
  readonly name: string
  readonly dir: string
  readonly shard: Shard | undefined
  readonly incrementalFile: string
}) => Promise<number>

export const incrementalFileOf = (shard: Shard | undefined): string =>
  shard === undefined
    ? 'reports/stryker-incremental.json'
    : `reports/stryker-incremental-${shard.index}of${shard.count}.json`

export const labelOf = (dir: string, shard: Shard | undefined): string =>
  shard === undefined ? dir : `${dir} (${shard.index}/${shard.count})`

const slugOf = (dir: string): string => dir.replaceAll('/', '-')

const shardOfJob = (job: Job): Shard | undefined =>
  job.shard === undefined ? undefined : { index: job.shard.index, count: job.shard.count }

const readText = (path: string): Promise<string> => Deno.readTextFile(path)

const readIfPresent = async (path: string): Promise<string | undefined> => {
  try {
    return await Deno.readTextFile(path)
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return undefined
    throw error
  }
}

const copyIfPresent = async (from: string, to: string): Promise<void> => {
  const text = await readIfPresent(from)
  if (text === undefined) return
  await Deno.mkdir(dirname(to), { recursive: true })
  await Deno.writeTextFile(to, text)
}

export type RunOptions = {
  readonly root: string
  readonly run: RunPackage
  readonly clock: () => number
  readonly log: (text: string) => void
}

/**
 * Runs the job's packages one at a time and stages what the Mutation workflow
 * uploads under `root`: `.timings/<job>.json`, `mutation-parts/`, `incremental/`.
 * A package that fails keeps its report check and never stops the next one.
 */
export const runJob = async (job: Job, options: RunOptions): Promise<{ readonly ok: boolean }> => {
  const shard = shardOfJob(job)
  const incrementalFile = incrementalFileOf(shard)
  const entries: Entry[] = []
  let ok = true
  for (const [position, name] of job.packages.entries()) {
    const dir = job.dirs[position]
    if (dir === undefined) throw new Error(`job ${job.id} names ${name} without a directory`)
    const started = options.clock()
    const exitCode = await options.run({ name, dir, shard, incrementalFile })
    entries.push({
      package: name,
      seconds: Math.round((options.clock() - started) / 1000),
      exitCode,
      ...(shard === undefined ? {} : { shard }),
    })

    const outcome: Outcome = exitCode === 0 ? 'success' : 'failure'
    const label = labelOf(dir, shard)
    const reportsDir = join(options.root, dir, 'reports')
    const input = { package: label, outcome, reportsDir, readFile: readText }
    options.log(await buildSummary(input))
    const missing = buildRequireError(input, await loadState(reportsDir, readText))
    if (missing !== null) {
      options.log(missing)
      ok = false
    }

    const part = join(
      options.root,
      'mutation-parts',
      slugOf(dir),
      shard === undefined ? 'whole' : `${shard.index}of${shard.count}`,
    )
    await Deno.mkdir(part, { recursive: true })
    await Deno.writeTextFile(
      join(part, 'mutation-part.json'),
      JSON.stringify({ package: dir, outcome, ...(shard === undefined ? {} : { shard }) } satisfies PartMeta),
    )
    await copyIfPresent(join(reportsDir, 'mutation', 'mutation.json'), join(part, 'mutation-report.json'))
    await copyIfPresent(join(reportsDir, 'mutation-stream.jsonl'), join(part, 'mutation-stream.jsonl'))
    await copyIfPresent(
      join(options.root, dir, incrementalFile),
      join(options.root, 'incremental', dir, incrementalFile),
    )
  }
  await Deno.mkdir(join(options.root, '.timings'), { recursive: true })
  await Deno.writeTextFile(
    join(options.root, '.timings', `${job.id}.json`),
    JSON.stringify({ job: job.id, entries } satisfies Part),
  )
  return { ok }
}

/**
 * One part per package. Shards partition a package's files, so their reports
 * union into the package's report; a file two shards both mutated means the
 * partition broke, and the fold refuses it. A package missing a shard, or a
 * shard's report, keeps only the streams, which merge-reports marks incomplete.
 */
export const combineParts = (parts: readonly StagedPart[]): Map<string, CombinedPart> => {
  const byPackage = Map.groupBy(parts, (part) => part.meta.package)
  const combined = new Map<string, CombinedPart>()
  for (const [dir, shards] of [...byPackage].sort(([a], [b]) => a.localeCompare(b))) {
    const outcome: Outcome = shards.every((part) => part.meta.outcome === 'success') ? 'success' : 'failure'
    const expected = shards[0]?.meta.shard?.count ?? 1
    const indices = new Set(shards.map((part) => part.meta.shard?.index ?? 1))
    const reports = shards.flatMap((part) => (part.report === undefined ? [] : [part.report]))
    const complete = indices.size === expected && reports.length === shards.length

    const owners = new Map<string, number>()
    for (const part of shards) {
      for (const file of Object.keys(part.report?.files ?? {})) {
        const other = owners.get(file)
        if (other !== undefined) {
          throw new Error(
            `${dir}: shards ${other} and ${part.meta.shard?.index} both mutated ${file}; ` +
              `shardMutate's file expansion missed a file Stryker's mutate patterns match.`,
          )
        }
        owners.set(file, part.meta.shard?.index ?? 1)
      }
    }

    const streams = shards.flatMap((part) => (part.stream === undefined ? [] : [part.stream]))
    const [first] = reports
    combined.set(dir, {
      meta: { package: dir, outcome },
      ...(complete && first !== undefined
        ? { report: { ...first, files: Object.assign({}, ...reports.map((report) => report.files)) } }
        : {}),
      ...(streams.length === 0 ? {} : { stream: streams.map((stream) => stream.trimEnd()).join('\n') + '\n' }),
    })
  }
  return combined
}

/** Every package directory the plan gave a job, once. */
export const plannedPackages = (jobs: readonly Job[]): string[] => [...new Set(jobs.flatMap((job) => job.dirs))].sort()

const readStagedParts = async (root: string): Promise<StagedPart[]> => {
  const parts: StagedPart[] = []
  for await (const marker of expandGlob('**/mutation-part.json', { root })) {
    const dir = dirname(marker.path)
    const report = await readIfPresent(join(dir, 'mutation-report.json'))
    const stream = await readIfPresent(join(dir, 'mutation-stream.jsonl'))
    parts.push({
      meta: JSON.parse(await Deno.readTextFile(marker.path)) as PartMeta,
      ...(report === undefined ? {} : { report: JSON.parse(report) as Report }),
      ...(stream === undefined ? {} : { stream }),
    })
  }
  return parts
}

const writeCombined = async (out: string, combined: ReadonlyMap<string, CombinedPart>): Promise<void> => {
  for (const [dir, part] of combined) {
    const target = join(out, slugOf(dir))
    await Deno.mkdir(target, { recursive: true })
    await Deno.writeTextFile(join(target, 'mutation-part.json'), JSON.stringify(part.meta))
    if (part.report !== undefined) {
      await Deno.writeTextFile(join(target, 'mutation-report.json'), JSON.stringify(part.report))
    }
    if (part.stream !== undefined) await Deno.writeTextFile(join(target, 'mutation-stream.jsonl'), part.stream)
  }
}

/** `timeout` signals the whole process group, so Stryker's workers stop with pnpm. */
const strykerUnderCap = (capSeconds: number): RunPackage => async ({ name, shard, incrementalFile }) => {
  const { code } = await new Deno.Command('timeout', {
    args: [
      '--kill-after=60',
      String(capSeconds),
      'corepack',
      'pnpm',
      '--filter',
      name,
      'mutation',
      '--incrementalFile',
      incrementalFile,
    ],
    env: { STRYKER_SHARD: shard === undefined ? '' : `${shard.index}/${shard.count}` },
    stdout: 'inherit',
    stderr: 'inherit',
  }).output()
  return code
}

const main = async (): Promise<void> => {
  const [command, ...rest] = Deno.args
  const args = parseArgs(rest, { string: ['cap-seconds', 'parts', 'out'] })
  if (command === 'run') {
    const job = JSON.parse(Deno.env.get('JOB') ?? 'null') as Job | null
    if (job === null) throw new Error('run needs JOB, one job from `test-timings.ts plan --task mutation`')
    const { ok } = await runJob(job, {
      root: Deno.cwd(),
      run: strykerUnderCap(Number(args['cap-seconds'] ?? 1800)),
      clock: Date.now,
      log: console.log,
    })
    if (!ok) Deno.exit(1)
    return
  }
  if (command === 'combine') {
    if (args.parts === undefined || args.out === undefined) throw new Error('combine needs --parts and --out')
    const jobs = JSON.parse(Deno.env.get('JOBS') ?? '[]') as Job[]
    await writeCombined(args.out, combineParts(await readStagedParts(args.parts)))
    const envFile = Deno.env.get('GITHUB_ENV')
    const packages = JSON.stringify(plannedPackages(jobs))
    if (envFile !== undefined && envFile !== '') {
      await Deno.writeTextFile(envFile, `PACKAGES=${packages}\n`, { append: true })
    }
    console.log(`planned packages: ${packages}`)
    return
  }
  throw new Error(`unknown command ${command ?? '(none)'}: expected run or combine`)
}

if (import.meta.main) await main()
