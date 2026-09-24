#!/usr/bin/env -S deno run --allow-read --allow-write --allow-env
// test-timings.ts — route the CI gate's `test` work by measured duration.
//
//   plan   read main's timing record and the workspace, pack every package's
//          tests into jobs of at most --target seconds of predicted work, and
//          split a package over the target into vitest shards. Writes `jobs`
//          and `merges` (JSON) to $GITHUB_OUTPUT.
//   part   write one job's measured test durations: from the newest turbo run
//          summary in .turbo/runs, or from --package/--shard/--seconds for a
//          shard job that ran vitest directly.
//   merge  overlay every part onto the previous record and write the new
//          record plus a per-job table to $GITHUB_STEP_SUMMARY.
//
// The record carries each package's most recent measured duration forward, so
// a cancelled run or a cache hit never erases a measurement.

import { parseArgs } from '@std/cli/parse-args'
import { expandGlob } from '@std/fs/expand-glob'
import { dirname, join, relative } from '@std/path'
import { parse } from '@std/yaml'

export type Shard = { readonly index: number; readonly count: number }

export type Measured = { readonly seconds: number; readonly sha: string }

export type TimingRecord = {
  readonly version: 1
  readonly packages: Readonly<Record<string, Measured>>
}

export type Entry = {
  readonly package: string
  readonly seconds: number
  readonly exitCode: number | null
  readonly shard?: Shard
}

export type Part = { readonly job: string; readonly entries: readonly Entry[] }

export type TestPackage = { readonly name: string; readonly dir: string; readonly browser: boolean }

export type Job = {
  readonly id: string
  readonly name: string
  readonly packages: readonly string[]
  readonly filters: string
  readonly browser: boolean
  readonly predicted: number
  readonly shard?: Shard & { readonly package: string; readonly dir: string; readonly slug: string }
}

export type MergeTarget = {
  readonly package: string
  readonly dir: string
  readonly slug: string
  readonly count: number
}

export type Plan = { readonly jobs: readonly Job[]; readonly merges: readonly MergeTarget[] }

export type PlanOptions = { readonly target: number; readonly maxJobs: number; readonly unknownSeconds: number }

export const emptyRecord: TimingRecord = { version: 1, packages: {} }

const slugOf = (name: string): string => name.replace(/^@[^/]+\//, '')

const predictedOf = (record: TimingRecord, options: PlanOptions) => (pkg: TestPackage): number =>
  record.packages[pkg.name]?.seconds ?? options.unknownSeconds

type Bin = { packages: TestPackage[]; seconds: number }

/** Longest package first, each into the least-loaded of `count` bins, so the loads come out even. */
const balance = (items: readonly (readonly [TestPackage, number])[], count: number): Bin[] => {
  const bins: Bin[] = Array.from({ length: count }, () => ({ packages: [], seconds: 0 }))
  for (const [pkg, seconds] of [...items].sort((a, b) => b[1] - a[1] || a[0].name.localeCompare(b[0].name))) {
    const bin = bins.reduce((least, candidate) => (candidate.seconds < least.seconds ? candidate : least))
    bin.packages.push(pkg)
    bin.seconds += seconds
  }
  return bins.filter((bin) => bin.packages.length > 0)
}

/**
 * Packs whole packages into the fewest jobs whose balanced loads fit `target`
 * predicted seconds, and splits a package predicted over `target` into shard
 * jobs of its own. When no job count within the budget left after shards fits,
 * the budget's jobs share the work evenly and run past the target.
 */
export const planJobs = (packages: readonly TestPackage[], record: TimingRecord, options: PlanOptions): Plan => {
  const predict = predictedOf(record, options)
  const oversized = packages.filter((pkg) => predict(pkg) > options.target)
  const whole = packages.filter((pkg) => predict(pkg) <= options.target).map((pkg) => [pkg, predict(pkg)] as const)

  const shardJobs: Job[] = []
  const merges: MergeTarget[] = []
  for (const pkg of [...oversized].sort((a, b) => a.name.localeCompare(b.name))) {
    const seconds = predict(pkg)
    const count = Math.ceil(seconds / options.target)
    const slug = slugOf(pkg.name)
    merges.push({ package: pkg.name, dir: pkg.dir, slug, count })
    for (let index = 1; index <= count; index++) {
      shardJobs.push({
        id: `${slug}-${index}`,
        name: `${slug} ${index}/${count}`,
        packages: [pkg.name],
        filters: `--filter=${pkg.name}`,
        browser: pkg.browser,
        predicted: Math.round(seconds / count),
        shard: { index, count, package: pkg.name, dir: pkg.dir, slug },
      })
    }
  }

  const budget = Math.max(1, options.maxJobs - shardJobs.length)
  const total = whole.reduce((sum, [, seconds]) => sum + seconds, 0)
  let count = Math.min(budget, Math.max(1, Math.ceil(total / options.target)))
  let bins = balance(whole, count)
  while (count < budget && bins.some((bin) => bin.seconds > options.target)) bins = balance(whole, ++count)

  const wholeJobs = bins.map((bin, i): Job => {
    const names = bin.packages.map((pkg) => pkg.name).sort()
    return {
      id: `group-${i + 1}`,
      name: names.map(slugOf).join(', '),
      packages: names,
      filters: names.map((name) => `--filter=${name}`).join(' '),
      browser: bin.packages.some((pkg) => pkg.browser),
      predicted: Math.round(bin.seconds),
    }
  })
  return { jobs: [...shardJobs, ...wholeJobs], merges }
}

type TurboTask = {
  readonly task?: string
  readonly package?: string
  readonly cache?: { readonly status?: string }
  readonly execution?: { readonly startTime?: number; readonly endTime?: number; readonly exitCode?: number | null }
}

/** One entry per `test` task turbo executed; cache hits measured nothing. */
export const entriesFromTurboSummary = (summary: { readonly tasks?: readonly TurboTask[] }): Entry[] =>
  (summary.tasks ?? []).flatMap((task) => {
    const start = task.execution?.startTime
    const end = task.execution?.endTime
    if (task.task !== 'test' || task.package === undefined || task.cache?.status === 'HIT') return []
    if (start === undefined || end === undefined) return []
    return [{
      package: task.package,
      seconds: Math.round((end - start) / 1000),
      exitCode: task.execution?.exitCode ?? null,
    }]
  })

/**
 * Overlays measured entries onto the previous record. A sharded package is
 * measured only when every one of its shards reported; otherwise its previous
 * duration stands.
 */
export const mergeRecord = (previous: TimingRecord, parts: readonly Part[], sha: string): TimingRecord => {
  const packages: Record<string, Measured> = { ...previous.packages }
  const byPackage = new Map<string, Entry[]>()
  for (const entry of parts.flatMap((part) => part.entries)) {
    byPackage.set(entry.package, [...(byPackage.get(entry.package) ?? []), entry])
  }
  for (const [name, entries] of byPackage) {
    const count = entries[0]?.shard?.count
    if (count === undefined) {
      packages[name] = { seconds: Math.max(...entries.map((entry) => entry.seconds)), sha }
      continue
    }
    const indices = new Set(entries.map((entry) => entry.shard?.index))
    const complete = Array.from({ length: count }, (_unused, i) => i + 1).every((index) => indices.has(index))
    if (complete) packages[name] = { seconds: entries.reduce((sum, entry) => sum + entry.seconds, 0), sha }
  }
  return { version: 1, packages }
}

const minutes = (seconds: number): string => `${Math.floor(seconds / 60)}m${String(seconds % 60).padStart(2, '0')}s`

/** A Markdown table of every measured entry, flagging any job over target. */
export const summaryTable = (parts: readonly Part[], target: number): string => {
  const rows = parts.flatMap((part) => {
    const total = part.entries.reduce((sum, entry) => sum + entry.seconds, 0)
    const flag = total > target ? ' ⚠ over target' : ''
    return part.entries.map((entry) => {
      const shard = entry.shard === undefined ? '' : ` (shard ${entry.shard.index}/${entry.shard.count})`
      const status = entry.exitCode === 0 ? 'passed' : entry.exitCode === null ? 'unknown' : 'failed'
      return `| ${part.job}${flag} | ${entry.package}${shard} | ${minutes(entry.seconds)} | ${status} |`
    })
  })
  return [
    `### Test timings (target ${minutes(target)} per job)`,
    '',
    '| Job | Package | Test time | Result |',
    '|---|---|---|---|',
    ...rows,
    '',
  ].join('\n')
}

const readJson = async <T>(path: string, fallback: T): Promise<T> => {
  try {
    return JSON.parse(await Deno.readTextFile(path)) as T
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return fallback
    throw error
  }
}

const readRecord = async (path: string | undefined): Promise<TimingRecord> => {
  if (path === undefined) return emptyRecord
  const found = await readJson<Partial<TimingRecord>>(path, {})
  return found.version === 1 && typeof found.packages === 'object' ? found as TimingRecord : emptyRecord
}

const workspaceTestPackages = async (root: string): Promise<TestPackage[]> => {
  const doc = parse(await Deno.readTextFile(join(root, 'pnpm-workspace.yaml'))) as { packages?: string[] }
  const found: TestPackage[] = []
  for (const glob of doc.packages ?? []) {
    for await (const manifest of expandGlob(join(glob, 'package.json'), { root, exclude: ['**/node_modules/**'] })) {
      const json = JSON.parse(await Deno.readTextFile(manifest.path)) as {
        name?: string
        scripts?: Record<string, string>
        devDependencies?: Record<string, string>
      }
      if (json.name === undefined || json.scripts?.['test'] === undefined) continue
      found.push({
        name: json.name,
        dir: relative(root, dirname(manifest.path)),
        browser: json.devDependencies?.['playwright'] !== undefined,
      })
    }
  }
  return found.sort((a, b) => a.name.localeCompare(b.name))
}

const appendEnvFile = async (variable: string, text: string): Promise<void> => {
  const path = Deno.env.get(variable)
  if (path !== undefined && path !== '') await Deno.writeTextFile(path, text, { append: true })
}

const newestTurboSummary = async (dir: string): Promise<{ tasks?: TurboTask[] }> => {
  const files: { path: string; mtime: number }[] = []
  try {
    for await (const entry of Deno.readDir(dir)) {
      if (!entry.isFile || !entry.name.endsWith('.json')) continue
      const path = join(dir, entry.name)
      files.push({ path, mtime: (await Deno.stat(path)).mtime?.getTime() ?? 0 })
    }
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return {}
    throw error
  }
  const newest = files.sort((a, b) => b.mtime - a.mtime)[0]
  return newest === undefined ? {} : readJson(newest.path, {})
}

const readParts = async (dir: string): Promise<Part[]> => {
  const parts: Part[] = []
  try {
    for await (const entry of expandGlob('**/*.json', { root: dir })) {
      parts.push(await readJson<Part>(entry.path, { job: entry.name, entries: [] }))
    }
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error
  }
  return parts.sort((a, b) => a.job.localeCompare(b.job))
}

const shardOf = (text: string | undefined): Shard | undefined => {
  const match = /^(\d+)\/(\d+)$/.exec(text ?? '')
  return match === null ? undefined : { index: Number(match[1]), count: Number(match[2]) }
}

const main = async (): Promise<void> => {
  const [command, ...rest] = Deno.args
  const args = parseArgs(rest, {
    string: ['record', 'previous', 'parts', 'out', 'job', 'package', 'shard', 'seconds', 'exit', 'sha', 'turbo-runs'],
    default: { target: '300', 'max-jobs': '12' },
  })
  const target = Number(args.target)
  if (command === 'plan') {
    const record = await readRecord(args.record)
    const plan = planJobs(await workspaceTestPackages(Deno.cwd()), record, {
      target,
      maxJobs: Number(args['max-jobs']),
      unknownSeconds: 60,
    })
    for (const job of plan.jobs) console.log(`${job.id.padEnd(28)} ~${minutes(job.predicted)}  ${job.name}`)
    await appendEnvFile('GITHUB_OUTPUT', `jobs=${JSON.stringify(plan.jobs)}\nmerges=${JSON.stringify(plan.merges)}\n`)
    return
  }
  if (command === 'part') {
    if (args.out === undefined || args.job === undefined) throw new Error('part needs --out and --job')
    const shard = shardOf(args.shard)
    const entries: Entry[] = args.package !== undefined
      ? [{
        package: args.package,
        seconds: Number(args.seconds),
        exitCode: args.exit === undefined ? null : Number(args.exit),
        ...(shard === undefined ? {} : { shard }),
      }]
      : entriesFromTurboSummary(await newestTurboSummary(args['turbo-runs'] ?? '.turbo/runs'))
    await Deno.writeTextFile(args.out, JSON.stringify({ job: args.job, entries } satisfies Part))
    return
  }
  if (command === 'merge') {
    if (args.parts === undefined || args.out === undefined) throw new Error('merge needs --parts and --out')
    const parts = await readParts(args.parts)
    const record = mergeRecord(await readRecord(args.previous), parts, args.sha ?? '')
    await Deno.writeTextFile(args.out, JSON.stringify(record, null, 2))
    const table = summaryTable(parts, target)
    console.log(table)
    await appendEnvFile('GITHUB_STEP_SUMMARY', table)
    return
  }
  throw new Error(`unknown command ${command ?? '(none)'}: expected plan, part, or merge`)
}

if (import.meta.main) await main()
