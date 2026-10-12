#!/usr/bin/env -S deno run --allow-read --allow-write --allow-env
// test-timings.ts - route a CI lane's per-package work by measured duration.
// `--task` names the package script the lane runs: `test` (the gate, default)
// or `mutation` (the Mutation workflow). For `mutation`, plan first refuses
// any package that would mutate more than its workflow files, then sizes each
// package from the mutants `stryker plan` counts (mutation-plan.ts).
//
//   plan   read main's timing record and the workspace, pack every package
//          that has the --task script into jobs of at most --target seconds of
//          predicted work, and split a package over the target into shards
//          (vitest `--shard` for test, `STRYKER_SHARD` for mutation). Writes
//          `jobs` (JSON) to $GITHUB_OUTPUT.
//   part   write one job's measured durations: from the newest turbo run
//          summary in .turbo/runs, or from --package/--shard/--seconds for a
//          package the job ran directly.
//   merge  overlay every part onto the previous record and write the new
//          record plus a per-job table to $GITHUB_STEP_SUMMARY.
//   latest print the record artifact's id to plan from: main's newest first.
//
// The record carries each package's most recent measured duration forward, so
// a cancelled run or a cache hit never erases a measurement. Only a passing run
// measures a duration; a failed or capped run stopped early, so it can raise a
// package's duration but never lower it.

import { pooledMap } from '@std/async/pool'
import { parseArgs } from '@std/cli/parse-args'
import { expandGlob } from '@std/fs/expand-glob'
import { dirname, fromFileUrl, join, relative } from '@std/path'
import { Result } from 'effect'
import {
  admitMutation,
  annotationOf,
  type JobShape,
  mutantCountOf,
  type MutationFacts,
  type ProbeFacts,
  probeFactsOf,
  secondsPerMutant,
  type Swept,
} from './mutation-plan.ts'

export type Shard = { readonly index: number; readonly count: number }

/**
 * `passedHash`: the dry-run turbo hash the plan gave the package's task when the whole of it last passed.
 * `mutants`: the mutants the plan counted for the package, so `seconds / mutants` is its rate.
 */
export type Measured = {
  readonly seconds: number
  readonly sha: string
  readonly passedHash?: string
  readonly mutants?: number
}

type ArtifactPage = {
  readonly artifacts: readonly {
    readonly id: number
    readonly expired: boolean
    readonly created_at?: string
    readonly workflow_run?: { readonly head_branch?: string }
  }[]
}

/** The ids of up to `count` live records, newest first, across every ref. */
export const recentRecords = (pages: readonly ArtifactPage[], count: number): number[] =>
  pages.flatMap((page) => page.artifacts).filter((artifact) => !artifact.expired)
    .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
    .slice(0, count)
    .map((artifact) => artifact.id)

/** Every package/hash pair any of these records says passed: a pass proves those inputs passed, on any ref. */
export const passesOf = (records: readonly TimingRecord[]): ReadonlySet<string> =>
  new Set(
    records.flatMap((record) =>
      Object.entries(record.packages).flatMap(([name, measured]) =>
        measured.passedHash === undefined ? [] : [passKey(name, measured.passedHash)]
      )
    ),
  )

const passKey = (name: string, hash: string): string => `${name}\u0000${hash}`

export const latestRecord = (pages: readonly ArtifactPage[], branch = 'main'): number | undefined => {
  const live = pages.flatMap((page) => page.artifacts).filter((artifact) => !artifact.expired)
    .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
  const on = (name: string) => live.find((artifact) => artifact.workflow_run?.head_branch === name)
  return (on(branch) ?? on('main') ?? live[0])?.id
}

/**
 * Version 1 records let a run that crashed in its first second overwrite a
 * package's duration, so a read discards them rather than plan from them.
 */
export type TimingRecord = {
  readonly version: 2
  readonly packages: Readonly<Record<string, Measured>>
}

export type Entry = {
  readonly package: string
  readonly seconds: number
  readonly exitCode: number | null
  readonly shard?: Shard
}

export type Part = { readonly job: string; readonly entries: readonly Entry[] }

export type TestPackage = {
  readonly name: string
  readonly dir: string
  readonly browser: boolean
  readonly shardable: boolean
}

export type Job = {
  readonly id: string
  readonly name: string
  readonly packages: readonly string[]
  readonly dirs: readonly string[]
  readonly filters: string
  readonly browser: boolean
  readonly predicted: number
  readonly shard?: Shard & { readonly package: string; readonly dir: string; readonly slug: string }
  /** Each package's task hash in the plan's turbo dry run, which a pass of the job is recorded against. */
  readonly hashes?: Readonly<Record<string, string>>
  /** Mutation only: each package's whole mutant count, on every shard job of it, never the shard's slice. */
  readonly mutants?: Readonly<Record<string, number>>
}

export type Plan = { readonly jobs: readonly Job[]; readonly warnings: readonly string[] }

export type PlanOptions = {
  readonly target: number
  readonly maxJobs: number
  readonly maxSeconds: number
  readonly unknownSeconds: number
  /** Seconds that replace a package's recorded duration, as mutation's mutant count times its rate. */
  readonly predicted?: ReadonlyMap<string, number>
}

export const emptyRecord: TimingRecord = { version: 2, packages: {} }

const slugOf = (name: string): string => name.replace(/^@[^/]+\//, '')

const idSlugsOf = (packages: readonly TestPackage[]): ReadonlyMap<string, string> => {
  const short = packages.map((pkg) => slugOf(pkg.name))
  const clashes = (slug: string) => slug === 'group' || short.filter((other) => other === slug).length > 1
  const slugs = new Map(packages.map((pkg, i) => [
    pkg.name,
    clashes(short[i]!)
      ? (pkg.name.startsWith('@') ? pkg.name.slice(1) : `pkg/${pkg.name}`).replace('/', '-')
      : short[i]!,
  ]))
  const colliding = [...slugs].filter(([, slug]) => [...slugs.values()].filter((other) => other === slug).length > 1)
  if (colliding.length > 0) {
    throw new Error(`no unique job id for the packages ${colliding.map(([name]) => name).join(', ')}`)
  }
  return slugs
}

const predictedOf = (record: TimingRecord, options: PlanOptions) => (pkg: TestPackage): number =>
  options.predicted?.get(pkg.name) ?? record.packages[pkg.name]?.seconds ?? options.unknownSeconds

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

const shardJobsOf = (pkg: TestPackage, seconds: number, count: number, slug: string): Job[] => {
  return Array.from({ length: count }, (_unused, i): Job => ({
    id: `${slug}-${i + 1}`,
    name: `${slug} ${i + 1}/${count}`,
    packages: [pkg.name],
    dirs: [pkg.dir],
    filters: `--filter=${pkg.name}`,
    browser: pkg.browser,
    predicted: Math.round(seconds / count),
    shard: { index: i + 1, count, package: pkg.name, dir: pkg.dir, slug },
  }))
}

const groupJobOf = (packages: readonly TestPackage[], seconds: number, id: string): Job => {
  const sorted = [...packages].sort((a, b) => a.name.localeCompare(b.name))
  const names = sorted.map((pkg) => pkg.name)
  return {
    id,
    name: names.map(slugOf).join(', '),
    packages: names,
    dirs: sorted.map((pkg) => pkg.dir),
    filters: names.map((name) => `--filter=${name}`).join(' '),
    browser: packages.some((pkg) => pkg.browser),
    predicted: Math.round(seconds),
  }
}

const sum = (values: readonly number[]): number => values.reduce((total, value) => total + value, 0)

const scaleShards = (wanted: readonly number[], floors: readonly number[], budget: number): number[] => {
  if (sum(wanted) <= budget) return [...wanted]
  const scaled = wanted.map((count, i) => Math.max(floors[i]!, Math.floor((count * budget) / sum(wanted))))
  while (sum(scaled) > budget) {
    const shrinkable = scaled.map((count, i) => (count > floors[i]! ? count : 0))
    const largest = shrinkable.indexOf(Math.max(...shrinkable))
    scaled[largest] = scaled[largest]! - 1
  }
  return scaled
}

const fewestBinsUnder = (items: readonly (readonly [TestPackage, number])[], limit: number, from: number): number => {
  let count = Math.max(1, from)
  while (count < items.length && balance(items, count).some((bin) => bin.seconds > limit)) count++
  return count
}

export const planJobs = (packages: readonly TestPackage[], record: TimingRecord, options: PlanOptions): Plan => {
  const predict = predictedOf(record, options)
  const byName = (a: TestPackage, b: TestPackage) => a.name.localeCompare(b.name)
  const oversized = packages.filter((pkg) => predict(pkg) > options.target).sort(byName)
  const splittable = oversized.filter((pkg) => pkg.shardable)
  const solo = oversized.filter((pkg) => !pkg.shardable)
  const slugs = idSlugsOf(oversized)
  const whole = packages.filter((pkg) => predict(pkg) <= options.target).map((pkg) => [pkg, predict(pkg)] as const)
  const wholeSeconds = sum(whole.map(([, seconds]) => seconds))
  const warnings = solo.map((pkg) =>
    `${pkg.name}: predicted ${minutes(predict(pkg))} is over the ${
      minutes(options.target)
    } target, but its script is not a final \`vitest run\`; it runs whole in one job`
  )

  const floors = splittable.map((pkg) => Math.ceil(predict(pkg) / options.maxSeconds))
  const wanted = splittable.map((pkg, i) => Math.max(floors[i]!, Math.ceil(predict(pkg) / options.target)))
  const minGroups = whole.length === 0
    ? 0
    : fewestBinsUnder(whole, options.maxSeconds, Math.ceil(wholeSeconds / options.maxSeconds))
  const budget = options.maxJobs - solo.length
  const overCap = sum(floors) + minGroups > budget

  const counts = overCap ? floors : scaleShards(wanted, floors, budget - minGroups)
  const groupBudget = overCap ? minGroups : budget - sum(counts)
  let groupCount = Math.min(groupBudget, Math.max(minGroups, Math.ceil(wholeSeconds / options.target)))
  let bins = whole.length === 0 ? [] : balance(whole, groupCount)
  while (groupCount < groupBudget && bins.some((bin) => bin.seconds > options.target)) {
    bins = balance(whole, ++groupCount)
  }

  const shardJobs = splittable.flatMap((pkg, i) => shardJobsOf(pkg, predict(pkg), counts[i]!, slugs.get(pkg.name)!))
  const soloJobs = solo.map((pkg) => groupJobOf([pkg], predict(pkg), `${slugs.get(pkg.name)!}-whole`))
  const groupJobs = bins.map((bin, i) => groupJobOf(bin.packages, bin.seconds, `group-${i + 1}`))
  const jobs = [...shardJobs, ...soloJobs, ...groupJobs]
  const capped = splittable.filter((_pkg, i) => counts[i]! < wanted[i]!)

  return {
    jobs,
    warnings: [
      ...warnings,
      ...(overCap
        ? [
          `--max-jobs ${options.maxJobs} cannot hold every job under --max-seconds ${options.maxSeconds}; planned ${jobs.length} jobs instead`,
        ]
        : capped.map((pkg) =>
          `--max-jobs ${options.maxJobs} caps ${pkg.name} at ${counts[splittable.indexOf(pkg)]} shards (wanted ${
            wanted[splittable.indexOf(pkg)]
          }); its shards run past the target`
        )),
      ...solo.filter((pkg) => predict(pkg) > options.maxSeconds).map((pkg) =>
        `${pkg.name}: predicted ${
          minutes(predict(pkg))
        } is over --max-seconds ${options.maxSeconds} and cannot be split`
      ),
    ],
  }
}

type TurboTask = {
  readonly task?: string
  readonly package?: string
  readonly cache?: { readonly status?: string }
  readonly execution?: { readonly startTime?: number; readonly endTime?: number; readonly exitCode?: number | null }
}

export type DryTask = {
  readonly task?: string
  readonly package?: string
  readonly hash?: string
  readonly cache?: { readonly status?: string; readonly remote?: boolean }
}

export type Skipped = {
  readonly name: string
  readonly hash: string
  readonly reason: 'remote cache hit' | 'recorded pass'
}

/**
 * The packages a run need not test: a real remote-cache hit on the package's task in turbo's dry run, or a
 * dry-run hash equal to the one the record says the package last passed whole on.
 */
export const skippedOf = (
  packages: readonly TestPackage[],
  record: TimingRecord,
  dry: readonly DryTask[],
  taskName = 'test',
  passes: ReadonlySet<string> = new Set(),
): Skipped[] =>
  packages.flatMap((pkg): Skipped[] => {
    const task = dry.find((entry) => entry.task === taskName && entry.package === pkg.name)
    if (task?.hash === undefined) return []
    if (task.cache?.remote === true && task.cache.status === 'HIT') {
      return [{ name: pkg.name, hash: task.hash, reason: 'remote cache hit' as const }]
    }
    if (record.packages[pkg.name]?.passedHash === task.hash || passes.has(passKey(pkg.name, task.hash))) {
      return [{ name: pkg.name, hash: task.hash, reason: 'recorded pass' as const }]
    }
    return []
  })

const readDry = async (path: string | undefined): Promise<readonly DryTask[] | undefined> => {
  if (path === undefined) return undefined
  try {
    const tasks = (JSON.parse(await Deno.readTextFile(path)) as { tasks?: unknown }).tasks
    if (Array.isArray(tasks)) return tasks as DryTask[]
  } catch {
    // an unreadable dry run plans every package
  }
  console.error(`warning: ${path} is not a turbo dry run; planning every package`)
  return undefined
}

/** One entry per `taskName` task turbo executed; cache hits measured nothing. */
export const entriesFromTurboSummary = (
  summary: { readonly tasks?: readonly TurboTask[] },
  taskName = 'test',
): Entry[] =>
  (summary.tasks ?? []).flatMap((task) => {
    const start = task.execution?.startTime
    const end = task.execution?.endTime
    if (task.task !== taskName || task.package === undefined || task.cache?.status === 'HIT') return []
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
 * duration stands. A package any entry of which did not pass is a lower bound:
 * it replaces the previous duration, or `unknownSeconds` for an unrecorded
 * package, only when it is longer. A package that passed whole records the
 * hash `planned` gives it as `passedHash`; any other measurement drops it. A
 * new measurement records the mutant count `mutants` gives the package, and a
 * kept one keeps its count, so `seconds / mutants` stays one run's rate.
 */
export const mergeRecord = (
  previous: TimingRecord,
  parts: readonly Part[],
  sha: string,
  unknownSeconds: number,
  planned: ReadonlyMap<string, string> = new Map(),
  mutants: ReadonlyMap<string, number> = new Map(),
): TimingRecord => {
  const packages: Record<string, Measured> = { ...previous.packages }
  const byPackage = new Map<string, Entry[]>()
  for (const entry of parts.flatMap((part) => part.entries).filter((entry) => Number.isFinite(entry.seconds))) {
    byPackage.set(entry.package, [...(byPackage.get(entry.package) ?? []), entry])
  }
  for (const [name, entries] of byPackage) {
    const count = entries[0]?.shard?.count
    const indices = new Set(entries.map((entry) => entry.shard?.index))
    const complete = count === undefined ||
      Array.from({ length: count }, (_unused, i) => i + 1).every((index) => indices.has(index))
    if (!complete) continue
    const seconds = count === undefined
      ? Math.max(...entries.map((entry) => entry.seconds))
      : entries.reduce((sum, entry) => sum + entry.seconds, 0)
    const passed = entries.every((entry) => entry.exitCode === 0)
    const passedHash = passed ? planned.get(name) : undefined
    const counted = mutants.get(name)
    const before = previous.packages[name]
    if (passed || seconds > (before?.seconds ?? unknownSeconds)) {
      packages[name] = {
        seconds,
        sha,
        ...(passedHash === undefined ? {} : { passedHash }),
        ...(counted === undefined ? {} : { mutants: counted }),
      }
    } else if (before !== undefined) {
      packages[name] = {
        seconds: before.seconds,
        sha: before.sha,
        ...(before.mutants === undefined ? {} : { mutants: before.mutants }),
      }
    }
  }
  return { version: 2, packages }
}

const minutes = (seconds: number): string => `${Math.floor(seconds / 60)}m${String(seconds % 60).padStart(2, '0')}s`

/** A Markdown table of every measured entry, flagging any job over target. */
export const summaryTable = (parts: readonly Part[], target: number, taskName = 'test'): string => {
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
    `### ${taskName} timings (target ${minutes(target)} per job)`,
    '',
    '| Job | Package | Time | Result |',
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
  return found.version === 2 && typeof found.packages === 'object' ? found as TimingRecord : emptyRecord
}

const readRecords = async (dir: string | undefined): Promise<TimingRecord[]> => {
  if (dir === undefined) return []
  const records: TimingRecord[] = []
  try {
    for await (const entry of expandGlob('**/*.json', { root: dir })) records.push(await readRecord(entry.path))
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error
  }
  return records
}

/**
 * The file-command paths every Actions step has. A child gets its own, so a config writing to them by name does not
 * touch the plan's outputs. This is not a sandbox: the child is the same user, as Stryker is in the Mutation job.
 */
const FILE_COMMANDS = ['GITHUB_OUTPUT', 'GITHUB_ENV', 'GITHUB_PATH', 'GITHUB_STATE', 'GITHUB_STEP_SUMMARY']

/**
 * The environment the config probe and `stryker plan` get, shaped as a Mutation job runs Stryker: the plan job's own
 * (`CI` included), file-command paths that exist, and `STRYKER_SHARD` as the job sets it, `shard` (empty for a whole
 * package). Not covered: the plan step's own variables are present; the Mutation run step's (`JOB`) and those pnpm
 * gives a package script (`npm_lifecycle_event` and the rest) are absent; so a config that reads those can still differ.
 */
const pnpmEnv = (scratch: string, shard: JobShape): Record<string, string> => ({
  ...Deno.env.toObject(),
  ...Object.fromEntries(FILE_COMMANDS.map((name) => [name, join(scratch, name)])),
  STRYKER_SHARD: shard,
  npm_config_manage_package_manager_versions: 'false',
})

/**
 * Runs pnpm in `cwd`, writing `what` to stderr as it starts and again with its wall time as it ends, so a plan job
 * its timeout stops names the call it was waiting on, and a finished one records how long each call took.
 */
const pnpm = async (
  cwd: string,
  args: readonly string[],
  what: string,
  shard: JobShape = '',
): Promise<Deno.CommandOutput> => {
  const scratch = await Deno.makeTempDir({ prefix: 'pnpm-env-' })
  try {
    for (const name of FILE_COMMANDS) await Deno.writeTextFile(join(scratch, name), '')
    const started = performance.now()
    console.error(`${what}: started`)
    const out = await new Deno.Command('pnpm', {
      args: [...args],
      cwd,
      clearEnv: true,
      env: pnpmEnv(scratch, shard),
      stdout: 'piped',
      stderr: 'piped',
    }).output()
    console.error(`${what}: exited ${out.code} after ${((performance.now() - started) / 1000).toFixed(1)} s`)
    return out
  } finally {
    await Deno.remove(scratch, { recursive: true }).catch((error) => {
      if (!(error instanceof Deno.errors.NotFound)) throw error
    })
  }
}

const text = new TextDecoder()

/** The workspace members, listed by a pnpm that gets only what it needs to run: no CI variable or token reaches it. */
const workspaceDirs = async (root: string): Promise<string[]> => {
  const passed = ['PATH', 'HOME', 'XDG_CACHE_HOME', 'XDG_DATA_HOME', 'COREPACK_HOME']
    .flatMap((name) => Deno.env.get(name) === undefined ? [] : [[name, Deno.env.get(name)!] as const])
  const out = await new Deno.Command('pnpm', {
    args: ['ls', '--recursive', '--depth', '-1', '--json'],
    cwd: root,
    clearEnv: true,
    env: { ...Object.fromEntries(passed), npm_config_manage_package_manager_versions: 'false' },
    stdout: 'piped',
    stderr: 'piped',
  }).output()
  if (!out.success) throw new Error(`pnpm ls failed in ${root}: ${text.decode(out.stderr)}`)
  const members = JSON.parse(text.decode(out.stdout)) as { path: string }[]
  const own = await Deno.realPath(root)
  return members.map((member) => relative(own, member.path)).filter((dir) => dir !== '').sort()
}

const shellActive = /[`$<>|;&\\'"]/

export const honoursShard = (script: string): boolean => {
  const commands = script.trim().split(' && ')
  return commands.every((command) => !shellActive.test(command)) &&
    /^vitest run(?: --?\w[\w.-]*(?:[= ][^\s-]\S*)?)*$/.test(commands.at(-1)!)
}

const workspacePackagesWith = async (root: string, script: string): Promise<TestPackage[]> => {
  const found: TestPackage[] = []
  for (const dir of await workspaceDirs(root)) {
    const json = JSON.parse(await Deno.readTextFile(join(root, dir, 'package.json'))) as {
      name?: string
      scripts?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    const command = json.scripts?.[script]
    // `mutation:full` alone still enrolls a package, so the mutation plan judges its script.
    const carried = command !== undefined ||
      (script === 'mutation' && Object.keys(json.scripts ?? {}).some((name) => name.startsWith('mutation:')))
    if (json.name === undefined || !carried) continue
    found.push({
      name: json.name,
      dir,
      browser: script === 'test' && json.devDependencies?.['playwright'] !== undefined,
      shardable: script !== 'test' || (command !== undefined && honoursShard(command)),
    })
  }
  if (found.length === 0) {
    throw new Error(`no workspace package in ${root} has a \`${script}\` script; an empty plan is never a passing gate`)
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

const numberFlag = (flag: string, text: string, integer: boolean, least: 0 | 'over 0'): number => {
  const value = Number(text)
  const low = least === 0 ? value < 0 : value <= 0
  if (text.trim() === '' || !Number.isFinite(value) || low || (integer && !Number.isInteger(value))) {
    const bound = least === 0 ? '0 or more' : 'greater than 0'
    throw new Error(`--${flag} must be a ${integer ? 'whole number' : 'number'} ${bound}, got '${text}'`)
  }
  return value
}

const positive = (flag: string, text: string, integer: boolean): number => numberFlag(flag, text, integer, 'over 0')

const atLeastZero = (flag: string, text: string, integer: boolean): number => numberFlag(flag, text, integer, 0)

const MUTATION_PROBE = join(dirname(fromFileUrl(import.meta.url)), 'mutation-probe.mjs')

/** Packages probed or counted at a time: each is a node process loading a config, or a Stryker discovery pass. */
const MUTATION_POOL = 4

const lastLines = (bytes: Uint8Array): string => text.decode(bytes).trim().split('\n').slice(-5).join(' ')

/** Every package's scripts, and its config judged by the probe once per job shape. */
const mutationFactsOf = async (root: string, packages: readonly TestPackage[]): Promise<MutationFacts[]> => {
  const probe = await Deno.readTextFile(MUTATION_PROBE)
  const probed = async (pkg: TestPackage, shard: JobShape): Promise<ProbeFacts> => {
    const out = await pnpm(
      join(root, pkg.dir),
      ['exec', 'node', '--input-type=module', '-e', probe],
      `${pkg.name}: the config probe (STRYKER_SHARD '${shard}')`,
      shard,
    )
    return probeFactsOf(text.decode(out.stdout), lastLines(out.stderr))
  }
  const facts = await Array.fromAsync(pooledMap(MUTATION_POOL, packages, async (pkg): Promise<MutationFacts> => {
    const json = JSON.parse(await Deno.readTextFile(join(root, pkg.dir, 'package.json'))) as {
      scripts?: Record<string, string>
    }
    const probes: Record<JobShape, ProbeFacts> = { '': await probed(pkg, ''), '1/1': await probed(pkg, '1/1') }
    return { name: pkg.name, dir: pkg.dir, scripts: json.scripts ?? {}, probes }
  }))
  return facts.sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * For each directory: the shared set expanded exactly as `mutation-probe.mjs`'s `expand` does (Node's `globSync`, run
 * from the package directory: it follows symlinks and skips hidden paths), and every file under a hidden path that
 * Stryker's crawl reaches (not a directory, and under none of the names its crawl always ignores) and that the shared
 * include patterns match once each hidden segment is made visible with a leading `_`, which keeps its own characters.
 */
const EXPAND = [
  "import { globSync, readdirSync, statSync } from 'node:fs'",
  "import { matchesGlob } from 'node:path'",
  'const { dirs, patterns } = JSON.parse(process.argv[1])',
  "const include = patterns.filter((pattern) => !pattern.startsWith('!'))",
  "const exclude = patterns.filter((pattern) => pattern.startsWith('!')).map((pattern) => pattern.slice(1))",
  "const ignored = new Set(['node_modules', '.git', '.next', '.nuxt', '.svelte-kit', '.turbo'])",
  "const tops = [...new Set(include.map((pattern) => pattern.split('/')[0]))]",
  "const walked = tops.some((top) => /[*?{[]/.test(top)) ? ['.'] : tops",
  'const isFile = (path) => {',
  '  try {',
  '    return statSync(path).isFile()',
  '  } catch {',
  '    return false',
  '  }',
  '}',
  'const listed = (top) => {',
  '  try {',
  "    return readdirSync(top, { recursive: true }).map((file) => (top === '.' ? file : `${top}/${file}`))",
  '  } catch {',
  '    return []',
  '  }',
  '}',
  'const hiddenOf = () =>',
  '  walked.flatMap(listed).filter((file) => {',
  "    const segments = file.split('/')",
  "    if (!segments.some((segment) => segment.startsWith('.'))) return false",
  '    if (segments.some((segment) => ignored.has(segment)) || !isFile(file)) return false',
  "    const visible = segments.map((segment) => (segment.startsWith('.') ? `_${segment}` : segment)).join('/')",
  '    return include.some((pattern) => matchesGlob(visible, pattern))',
  '  }).sort()',
  'const root = process.cwd()',
  'const facts = Object.fromEntries(dirs.map((dir) => {',
  '  process.chdir(`${root}/${dir}`)',
  '  return [dir, { files: globSync(include, { exclude }).sort(), hidden: hiddenOf() }]',
  '}))',
  'console.log(JSON.stringify(facts))',
].join('\n')

/**
 * Every workspace package, whether the plan enrols it, and what `EXPAND` finds in it for the shared mutated set
 * (`patterns`, as the installed `@systemfsoftware/stryker-config` declares them). The workspace root is not a package
 * the plan can enrol, so it is not judged; a member with no name can never be enrolled, so it is named by its directory.
 */
const sweptOf = async (
  root: string,
  enrolled: readonly TestPackage[],
  patterns: readonly string[],
): Promise<Swept[]> => {
  const names = new Set(enrolled.map((pkg) => pkg.name))
  const members: { name: string; dir: string; enrolled: boolean }[] = []
  for (const dir of await workspaceDirs(root)) {
    const json = JSON.parse(await Deno.readTextFile(join(root, dir, 'package.json'))) as { name?: string }
    members.push({ name: json.name ?? dir, dir, enrolled: json.name !== undefined && names.has(json.name) })
  }
  if (members.length === 0) return []
  const dirs = members.map((pkg) => pkg.dir)
  const out = await pnpm(
    root,
    ['exec', 'node', '--input-type=module', '-e', EXPAND, JSON.stringify({ dirs, patterns })],
    `${dirs.length} workspace packages: the shared mutated set and hidden workflow files`,
  )
  if (!out.success) throw new Error(`expanding the shared mutated set failed: ${lastLines(out.stderr)}`)
  const facts = JSON.parse(text.decode(out.stdout).trim().split('\n').at(-1) ?? '{}') as Record<
    string,
    { files: string[]; hidden: string[] }
  >
  return members.map((pkg) => ({
    name: pkg.name,
    enrolled: pkg.enrolled,
    files: facts[pkg.dir]?.files ?? [],
    hidden: facts[pkg.dir]?.hidden ?? [],
  }))
}

/** Every mutant `stryker plan --full` discovers in the package, ignoring the incremental report. */
const mutantsOf = async (root: string, pkg: TestPackage, target: number): Promise<number> => {
  const dir = await Deno.makeTempDir({ prefix: 'stryker-plan-' })
  try {
    const out = await pnpm(join(root, pkg.dir), [
      'exec',
      'stryker',
      'plan',
      '--full',
      '--target-seconds',
      String(target),
      '--out',
      join(dir, 'plan.json'),
    ], `${pkg.name}: stryker plan`)
    if (!out.success) throw new Error(`${pkg.name}: stryker plan exited ${out.code}: ${lastLines(out.stderr)}`)
    return Result.getOrThrowWith(
      mutantCountOf(await Deno.readTextFile(join(dir, 'plan.json'))),
      (reason) => new Error(`${pkg.name}: stryker plan wrote no version 1 shard plan: ${reason}`),
    )
  } finally {
    await Deno.remove(dir, { recursive: true })
  }
}

type MutationSizing = {
  readonly mutants: ReadonlyMap<string, number>
  readonly predicted: ReadonlyMap<string, number>
  readonly table: string
}

/** Each package's predicted seconds: the mutants Stryker plans for it times its seconds per mutant. */
const mutationSizingOf = async (
  root: string,
  packages: readonly TestPackage[],
  record: TimingRecord,
  target: number,
  unknownMutantSeconds: number,
): Promise<MutationSizing> => {
  const counted = await Array.fromAsync(
    pooledMap(MUTATION_POOL, packages, async (pkg) => [pkg.name, await mutantsOf(root, pkg, target)] as const),
  )
  const rows = counted.sort(([a], [b]) => a.localeCompare(b)).map(([name, mutants]) => {
    const rate = secondsPerMutant(record, name, unknownMutantSeconds)
    return { name, mutants, rate, predicted: mutants * rate.seconds }
  })
  return {
    mutants: new Map(rows.map((row) => [row.name, row.mutants])),
    predicted: new Map(rows.map((row) => [row.name, row.predicted])),
    table: [
      '### mutation sizing: mutants Stryker plans, times seconds per mutant',
      '',
      '| package | mutants | s/mutant | rate from | predicted |',
      '|---|---|---|---|---|',
      ...rows.map((row) =>
        `| ${row.name} | ${row.mutants} | ${row.rate.seconds.toFixed(2)} | ${row.rate.source} | ${
          minutes(Math.round(row.predicted))
        } |`
      ),
      '',
    ].join('\n'),
  }
}

const main = async (): Promise<void> => {
  const [command, ...rest] = Deno.args
  const args = parseArgs(rest, {
    string: [
      'record',
      'previous',
      'parts',
      'out',
      'job',
      'package',
      'shard',
      'seconds',
      'exit',
      'sha',
      'turbo-runs',
      'listing',
      'task',
      'target',
      'max-jobs',
      'unknown-seconds',
      'unknown-mutant-seconds',
      'max-seconds',
      'dry',
      'raw',
      'branch',
      'plan',
      'passes',
      'count',
    ],
    default: {
      target: '300',
      'max-jobs': '12',
      'max-seconds': '1800',
      'unknown-seconds': '60',
      'unknown-mutant-seconds': '21',
      task: 'test',
    },
  })
  const task = String(args.task)
  if (command === 'plan') {
    const options = {
      target: positive('target', args.target, false),
      maxJobs: positive('max-jobs', args['max-jobs'], true),
      maxSeconds: positive('max-seconds', args['max-seconds'], false),
      unknownSeconds: positive('unknown-seconds', args['unknown-seconds'], false),
    }
    if (options.maxSeconds < options.target) {
      throw new Error(`--max-seconds ${options.maxSeconds} is below --target ${options.target}; no job could fit both`)
    }
    const record = await readRecord(args.record)
    const root = Deno.cwd()
    const packages = await workspacePackagesWith(root, task)
    if (packages.length === 0) throw new Error('the plan has no jobs though packages carry the task script')
    if (task === 'mutation') {
      const facts = await mutationFactsOf(root, packages)
      const shared = facts.map((pkg) => pkg.probes[''].shared).find((set) => set !== null)
      const { refusals } = admitMutation(facts, shared ? await sweptOf(root, packages, shared.patterns) : [])
      for (const refusal of refusals) console.error(annotationOf(refusal))
      if (refusals.length > 0) {
        const refused = new Set(refusals.map((refusal) => refusal.package))
        throw new Error(`${refused.size} packages refused for mutation; no Stryker run is planned`)
      }
    }
    const dry = await readDry(args.dry) ?? []
    const records = await readRecords(args.passes)
    const passes = passesOf([record, ...records])
    if (args.passes !== undefined) console.log(`pass records read: ${records.length}, pass set: ${passes.size}`)
    const skipped = skippedOf(packages, record, dry, task, passes)
    const planned = packages.filter((pkg) => !skipped.some((skip) => skip.name === pkg.name))
    const sizing = task === 'mutation'
      ? await mutationSizingOf(
        root,
        planned,
        record,
        options.target,
        positive('unknown-mutant-seconds', args['unknown-mutant-seconds'], false),
      )
      : undefined
    const plan = planJobs(planned, record, sizing === undefined ? options : { ...options, predicted: sizing.predicted })
    const hashes = new Map(
      dry.flatMap((entry) =>
        entry.task === task && entry.package !== undefined && entry.hash !== undefined
          ? [[entry.package, entry.hash] as const]
          : []
      ),
    )
    const jobs = plan.jobs.map((job): Job => {
      const known = job.packages.flatMap((name) => hashes.has(name) ? [[name, hashes.get(name)!] as const] : [])
      const counted = sizing === undefined
        ? {}
        : { mutants: Object.fromEntries(job.packages.map((name) => [name, sizing.mutants.get(name) ?? 0])) }
      return { ...job, ...(known.length === 0 ? {} : { hashes: Object.fromEntries(known) }), ...counted }
    })
    for (const warning of plan.warnings) console.error(`warning: ${warning}`)
    for (const job of jobs) console.log(`${job.id.padEnd(28)} ~${minutes(job.predicted)}  ${job.name}`)
    const table = skipped.length === 0 ? '' : [
      `### ${skipped.length} packages skipped: their ${task} already passed on these inputs`,
      '',
      '| package | turbo hash | why |',
      '|---|---|---|',
      ...skipped.map((skip) => `| ${skip.name} | \`${skip.hash}\` | ${skip.reason} |`),
      '',
    ].join('\n')
    if (table !== '') console.log(table)
    if (sizing !== undefined) console.log(sizing.table)
    await appendEnvFile('GITHUB_STEP_SUMMARY', table + (sizing?.table ?? ''))
    await appendEnvFile('GITHUB_OUTPUT', `jobs=${JSON.stringify(jobs)}\n`)
    return
  }
  if (command === 'part') {
    if (args.out === undefined || args.job === undefined) throw new Error('part needs --out and --job')
    const raw = args.raw === undefined
      ? undefined
      : JSON.parse(await Deno.readTextFile(args.raw)) as Record<string, unknown> & { tasks?: TurboTask[] }
    if (raw !== undefined && raw.tasks === undefined) {
      for (const key of ['package', 'shard', 'seconds', 'exit']) args[key] = String(raw[key] ?? '')
    }
    const shard = shardOf(args.shard)
    const entries: Entry[] = raw?.tasks !== undefined
      ? entriesFromTurboSummary(raw, task)
      : args.package !== undefined
      ? [{
        package: args.package,
        seconds: atLeastZero('seconds', args.seconds ?? '', false),
        exitCode: args.exit === undefined ? null : atLeastZero('exit', args.exit, true),
        ...(shard === undefined ? {} : { shard }),
      }]
      : entriesFromTurboSummary(await newestTurboSummary(args['turbo-runs'] ?? '.turbo/runs'), task)
    await Deno.writeTextFile(args.out, JSON.stringify({ job: args.job, entries } satisfies Part))
    return
  }
  if (command === 'merge') {
    if (args.parts === undefined || args.out === undefined) throw new Error('merge needs --parts and --out')
    const parts = await readParts(args.parts)
    const target = positive('target', args.target, false)
    const unknownSeconds = positive('unknown-seconds', args['unknown-seconds'], false)
    const plan = args.plan === undefined ? [] : JSON.parse(await Deno.readTextFile(args.plan)) as readonly Job[]
    const planned = new Map(plan.flatMap((job) => Object.entries(job.hashes ?? {})))
    const mutants = new Map(plan.flatMap((job) => Object.entries(job.mutants ?? {})))
    const previous = await readRecord(args.previous)
    const record = mergeRecord(previous, parts, args.sha ?? '', unknownSeconds, planned, mutants)
    await Deno.writeTextFile(args.out, JSON.stringify(record, null, 2))
    const table = summaryTable(parts, target, task)
    console.log(table)
    await appendEnvFile('GITHUB_STEP_SUMMARY', table)
    return
  }
  if (command === 'recent') {
    if (args.listing === undefined) throw new Error('recent needs --listing')
    const pages = JSON.parse(await Deno.readTextFile(args.listing)) as readonly ArtifactPage[]
    for (const id of recentRecords(pages, positive('count', args.count ?? '30', true))) console.log(id)
    return
  }
  if (command === 'latest') {
    if (args.listing === undefined) throw new Error('latest needs --listing')
    const pages = JSON.parse(await Deno.readTextFile(args.listing)) as readonly ArtifactPage[]
    const id = latestRecord(pages, args.branch ?? 'main')
    if (id !== undefined) console.log(id)
    return
  }
  throw new Error(`unknown command ${command ?? '(none)'}: expected plan, part, merge, recent, or latest`)
}

if (import.meta.main) await main()
