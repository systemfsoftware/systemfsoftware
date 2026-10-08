#!/usr/bin/env -S deno run --allow-read --allow-write --allow-env
// test-timings.ts — route a CI lane's per-package work by measured duration.
// `--task` names the package script the lane runs: `test` (the gate, default)
// or `mutation` (the Mutation workflow).
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

import { parseArgs } from '@std/cli/parse-args'
import { expandGlob } from '@std/fs/expand-glob'
import { join, relative } from '@std/path'

export type Shard = { readonly index: number; readonly count: number }

/** `passedHash`: the turbo hash of the package's task when every shard of it last passed. */
export type Measured = { readonly seconds: number; readonly sha: string; readonly passedHash?: string }

type ArtifactPage = {
  readonly artifacts: readonly {
    readonly id: number
    readonly expired: boolean
    readonly workflow_run?: { readonly head_branch?: string }
  }[]
}

export const latestRecord = (pages: readonly ArtifactPage[], branch = 'main'): number | undefined => {
  const live = pages.flatMap((page) => page.artifacts).filter((artifact) => !artifact.expired)
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
  readonly hash?: string
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
  readonly shard?: Shard & {
    readonly package: string
    readonly dir: string
    readonly slug: string
    readonly hash?: string
  }
}

export type Plan = { readonly jobs: readonly Job[]; readonly warnings: readonly string[] }

export type PlanOptions = {
  readonly target: number
  readonly maxJobs: number
  readonly maxSeconds: number
  readonly unknownSeconds: number
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
 * The packages a run need not test: a real remote-cache hit on the package's task in turbo's dry run, or, for a
 * package the record says passed whole as shards, a dry-run hash equal to the one those shards passed on.
 */
export const skippedOf = (
  packages: readonly TestPackage[],
  record: TimingRecord,
  dry: readonly DryTask[],
  taskName = 'test',
): Skipped[] =>
  packages.flatMap((pkg): Skipped[] => {
    const task = dry.find((entry) => entry.task === taskName && entry.package === pkg.name)
    if (task?.hash === undefined) return []
    if (task.cache?.remote === true && task.cache.status === 'HIT') {
      return [{ name: pkg.name, hash: task.hash, reason: 'remote cache hit' as const }]
    }
    if (record.packages[pkg.name]?.passedHash === task.hash) {
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
 * package, only when it is longer.
 */
export const mergeRecord = (
  previous: TimingRecord,
  parts: readonly Part[],
  sha: string,
  unknownSeconds: number,
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
    const hashes = new Set(entries.map((entry) => entry.hash))
    const passedHash = count !== undefined && passed && hashes.size === 1 ? entries[0]!.hash : undefined
    const before = previous.packages[name]
    if (passed || seconds > (before?.seconds ?? unknownSeconds)) {
      packages[name] = { seconds, sha, ...(passedHash === undefined ? {} : { passedHash }) }
    } else if (before !== undefined) packages[name] = { seconds: before.seconds, sha: before.sha }
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
  const text = new TextDecoder()
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
    if (json.name === undefined || command === undefined) continue
    found.push({
      name: json.name,
      dir,
      browser: script === 'test' && json.devDependencies?.['playwright'] !== undefined,
      shardable: script !== 'test' || honoursShard(command),
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
      'max-seconds',
      'dry',
      'raw',
      'branch',
    ],
    default: { target: '300', 'max-jobs': '12', 'max-seconds': '1800', 'unknown-seconds': '60', task: 'test' },
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
    const packages = await workspacePackagesWith(Deno.cwd(), task)
    if (packages.length === 0) throw new Error('the plan has no jobs though packages carry the task script')
    const dry = await readDry(args.dry) ?? []
    const skipped = skippedOf(packages, record, dry, task)
    const plan = planJobs(packages.filter((pkg) => !skipped.some((skip) => skip.name === pkg.name)), record, options)
    const hashOf = (name: string) => dry.find((entry) => entry.task === task && entry.package === name)?.hash
    const jobs = plan.jobs.map((job) =>
      job.shard === undefined || hashOf(job.shard.package) === undefined
        ? job
        : { ...job, shard: { ...job.shard, hash: hashOf(job.shard.package) } }
    )
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
    await appendEnvFile('GITHUB_STEP_SUMMARY', table)
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
    const hash = typeof raw?.hash === 'string' && raw.hash !== '' ? raw.hash : undefined
    const entries: Entry[] = raw?.tasks !== undefined
      ? entriesFromTurboSummary(raw, task)
      : args.package !== undefined
      ? [{
        package: args.package,
        seconds: atLeastZero('seconds', args.seconds ?? '', false),
        exitCode: args.exit === undefined ? null : atLeastZero('exit', args.exit, true),
        ...(shard === undefined ? {} : { shard }),
        ...(hash === undefined ? {} : { hash }),
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
    const record = mergeRecord(await readRecord(args.previous), parts, args.sha ?? '', unknownSeconds)
    await Deno.writeTextFile(args.out, JSON.stringify(record, null, 2))
    const table = summaryTable(parts, target, task)
    console.log(table)
    await appendEnvFile('GITHUB_STEP_SUMMARY', table)
    return
  }
  if (command === 'latest') {
    if (args.listing === undefined) throw new Error('latest needs --listing')
    const pages = JSON.parse(await Deno.readTextFile(args.listing)) as readonly ArtifactPage[]
    const id = latestRecord(pages, args.branch ?? 'main')
    if (id !== undefined) console.log(id)
    return
  }
  throw new Error(`unknown command ${command ?? '(none)'}: expected plan, part, merge, or latest`)
}

if (import.meta.main) await main()
