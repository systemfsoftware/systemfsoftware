// mutation-plan.ts - the decisions behind `test-timings.ts plan --task mutation`:
// which packages may be mutated, how many mutants Stryker plans for one, and how
// long a mutant takes. Nothing here reads a file or runs a process; test-timings
// gathers the facts and acts on the verdicts.

import { Result, Schema } from 'effect'
import type { TimingRecord } from './test-timings.ts'

const ProbeFactsSchema = Schema.Struct({
  config: Schema.NullOr(Schema.String),
  shared: Schema.NullOr(Schema.Struct({ patterns: Schema.Array(Schema.String), files: Schema.Array(Schema.String) })),
  own: Schema.NullOr(Schema.Struct({
    patterns: Schema.NullOr(Schema.Array(Schema.String)),
    extends: Schema.Unknown,
    files: Schema.Array(Schema.String),
  })),
  error: Schema.NullOr(Schema.String),
})

/** What `mutation-probe.mjs` printed for one package. */
export type ProbeFacts = typeof ProbeFactsSchema.Type

const decodeProbe = Schema.decodeUnknownResult(Schema.fromJsonString(ProbeFactsSchema))

/**
 * The facts on the probe's stdout. Output that does not decode is a probe that
 * could not judge the package, so it reads as a config that would not load.
 */
export const probeFactsOf = (stdout: string, stderr: string): ProbeFacts =>
  Result.match(decodeProbe(stdout.trim().split('\n').at(-1) ?? ''), {
    onSuccess: (facts) => facts,
    onFailure: (error) => ({
      config: null,
      shared: null,
      own: null,
      error: `the config probe printed no facts (${error.message}): ${stderr.trim().split('\n').at(-1) ?? ''}`,
    }),
  })

/**
 * The values a Mutation job gives `STRYKER_SHARD`: empty for a package it runs whole, `<index>/<count>` for a shard
 * (`1/1`, a shard that owns every file). A package is admitted before the plan decides which it gets, so its config
 * is judged under both.
 */
export const JOB_SHAPES = ['', '1/1'] as const

export type JobShape = (typeof JOB_SHAPES)[number]

export type MutationFacts = {
  readonly name: string
  readonly dir: string
  readonly scripts: Readonly<Record<string, string>>
  /** The probe's facts with `STRYKER_SHARD` set to each job shape. */
  readonly probes: Readonly<Record<JobShape, ProbeFacts>>
}

/** The job shapes a config refusal was found under, in `JOB_SHAPES` order, each once (`MutationFacts` holds one probe per shape). */
export type Shapes = readonly [JobShape, ...JobShape[]]

export type Refusal =
  | { readonly reason: 'mutation-script'; readonly package: string; readonly script: string; readonly text: string }
  | { readonly reason: 'no-workflow-file'; readonly package: string; readonly patterns: readonly string[] }
  | { readonly reason: 'config-unloadable'; readonly package: string; readonly shards: Shapes; readonly error: string }
  | {
    readonly reason: 'own-mutate-targets'
    readonly package: string
    readonly shards: Shapes
    readonly config: string
    readonly patterns: readonly string[] | null
    readonly extends: unknown
    readonly omitted: readonly string[]
  }
  | {
    readonly reason: 'non-workflow-target'
    readonly package: string
    readonly shards: Shapes
    readonly files: readonly string[]
  }
  | {
    readonly reason: 'test-file-target'
    readonly package: string
    readonly shards: Shapes
    readonly files: readonly string[]
  }

export type Admitted = { readonly name: string; readonly dir: string; readonly files: readonly string[] }

export type Admission = { readonly admitted: readonly Admitted[]; readonly refusals: readonly Refusal[] }

/** The one mutation script a package may carry, as `"mutation": "stryker run"`; any `mutation:*` variant is refused. */
export const MUTATION_SCRIPT = 'stryker run'

const TEST_DIRECTORY = /(?:^|\/)(?:__tests__|__fixtures__|__mocks__)\//
const TEST_FILE = /\.(?:test|spec|tst)\.[cm]?[jt]sx?$/

const isTestFile = (file: string): boolean => TEST_DIRECTORY.test(file) || TEST_FILE.test(file)

const isMutationScript = (script: string): boolean => script === 'mutation' || script.startsWith('mutation:')

/** The refusals one shape's facts give: the config's, plus `no-workflow-file` when the shared set matches nothing. */
const configRefusalsOf = (pkg: string, shard: JobShape, probe: ProbeFacts): Refusal[] => {
  const { shared, own, error, config } = probe
  const shards: Shapes = [shard]
  const empty: Refusal[] = shared !== null && shared.files.length === 0
    ? [{ reason: 'no-workflow-file', package: pkg, patterns: shared.patterns }]
    : []
  if (error !== null) return [...empty, { reason: 'config-unloadable', package: pkg, shards, error }]
  if (own === null || shared === null) return empty
  const planned = new Set(shared.files)
  const tests = own.files.filter(isTestFile)
  const nonWorkflow = own.files.filter((file) => !planned.has(file) && !isTestFile(file))
  const ownFiles = new Set(own.files)
  return [
    ...empty,
    {
      reason: 'own-mutate-targets',
      package: pkg,
      shards,
      config: config ?? '',
      patterns: own.patterns,
      extends: own.extends,
      omitted: shared.files.filter((file) => !ownFiles.has(file)),
    },
    ...(nonWorkflow.length === 0
      ? []
      : [{ reason: 'non-workflow-target' as const, package: pkg, shards, files: nonWorkflow }]),
    ...(tests.length === 0 ? [] : [{ reason: 'test-file-target' as const, package: pkg, shards, files: tests }]),
  ]
}

/** A refusal with its job shapes left out, so two shapes that refuse the same way give one annotation. */
const sameRefusalKey = (refusal: Refusal): string => {
  const { shards: _shards, ...rest } = { shards: [], ...refusal }
  return JSON.stringify(rest)
}

/** `refusal` found under `more` shapes as well. */
const alsoUnder = (refusal: Refusal, more: Refusal): Refusal =>
  'shards' in refusal && 'shards' in more ? { ...refusal, shards: [...refusal.shards, ...more.shards] } : refusal

/**
 * The package's script refusals, and every job shape's config refusals; a refusal two shapes share is reported once,
 * naming every shape that gave it.
 */
const refusalsOf = (facts: MutationFacts): Refusal[] => {
  const pkg = facts.name
  const scripts: Refusal[] = Object.entries(facts.scripts)
    .filter(([script, text]) => isMutationScript(script) && (script !== 'mutation' || text.trim() !== MUTATION_SCRIPT))
    .map(([script, text]) => ({ reason: 'mutation-script', package: pkg, script, text }))
  const merged = new Map<string, Refusal>()
  const configs = JOB_SHAPES.flatMap((shard) => configRefusalsOf(pkg, shard, facts.probes[shard]))
  for (const refusal of configs) {
    const key = sameRefusalKey(refusal)
    const seen = merged.get(key)
    merged.set(key, seen === undefined ? refusal : alsoUnder(seen, refusal))
  }
  return [...scripts, ...merged.values()]
}

/** Every package with a refusal is refused, and every refusal is kept, so one run reports them all. */
export const admitMutation = (packages: readonly MutationFacts[]): Admission => {
  const judged = packages.map((facts) => [facts, refusalsOf(facts)] as const)
  return {
    admitted: judged.filter(([, refusals]) => refusals.length === 0)
      .map(([facts]) => ({ name: facts.name, dir: facts.dir, files: facts.probes[''].shared?.files ?? [] })),
    refusals: judged.flatMap(([, refusals]) => refusals),
  }
}

const list = (files: readonly string[]): string => files.join(', ')

/** `when STRYKER_SHARD is '' or '1/1'`: the shapes a config refusal holds under. */
const underShapes = (shards: Shapes): string =>
  `when STRYKER_SHARD is ${shards.map((shard) => `'${shard}'`).join(' or ')}`

const ownSetOf = (refusal: Extract<Refusal, { reason: 'own-mutate-targets' }>): string => {
  const set = refusal.patterns === null ? "Stryker's default mutate" : `mutate ${JSON.stringify(refusal.patterns)}`
  const chain = refusal.extends === null ? '' : `, extends ${JSON.stringify(refusal.extends)}`
  const omitted = refusal.omitted.length === 0 ? '' : `, leaving out ${list(refusal.omitted)}`
  return `${refusal.config} sets ${set}${chain}${omitted} ${underShapes(refusal.shards)}; ` +
    'spread sharedConfig from @systemfsoftware/stryker-config and set no mutate'
}

const detailOf = (refusal: Refusal): string => {
  switch (refusal.reason) {
    case 'mutation-script':
      return `script "${refusal.script}" is "${refusal.text}"; the only mutation script is "mutation": "${MUTATION_SCRIPT}"`
    case 'no-workflow-file':
      return `${list(refusal.patterns)} matches no file; a package with no workflow file carries no mutation script`
    case 'config-unloadable':
      return `${refusal.error} (${underShapes(refusal.shards)})`
    case 'own-mutate-targets':
      return ownSetOf(refusal)
    case 'non-workflow-target':
      return `mutates non-workflow files ${list(refusal.files)} ${underShapes(refusal.shards)}`
    case 'test-file-target':
      return `mutates test files ${list(refusal.files)} ${underShapes(refusal.shards)}`
  }
}

/** One GitHub annotation, titled with the refusal's reason. */
export const annotationOf = (refusal: Refusal): string =>
  `::error title=${refusal.reason}::${refusal.package}: ${detailOf(refusal).replaceAll('\n', ' ')}`

/**
 * A `stryker plan --out` file: the `ShardPlan` of
 * `@systemfsoftware/stryker-js-cli-contract` 0.3 (`version: 1`), whose shards
 * list each project's mutant ids. Only the fields counted here are read.
 */
const ShardPlanSchema = Schema.fromJsonString(Schema.Struct({
  version: Schema.Literal(1),
  shards: Schema.Array(Schema.Struct({
    projects: Schema.Array(Schema.Struct({ mutants: Schema.Array(Schema.String) })),
  })),
}))

const decodeShardPlan = Schema.decodeUnknownResult(ShardPlanSchema)

/** The number of mutants a `stryker plan --out` file plans, or why the file is not a version 1 shard plan. */
export const mutantCountOf = (text: string): Result.Result<number, string> =>
  Result.match(decodeShardPlan(text), {
    onSuccess: (plan) =>
      Result.succeed(
        plan.shards.reduce(
          (total, shard) => total + shard.projects.reduce((sum, project) => sum + project.mutants.length, 0),
          0,
        ),
      ),
    onFailure: (error) => Result.fail(error.message),
  })

export type Rate = {
  readonly seconds: number
  readonly source: 'own' | 'slowest recorded' | 'unknown-mutant-seconds'
}

const measuredRate = (measured: { readonly seconds: number; readonly mutants?: number } | undefined) =>
  measured?.mutants === undefined || measured.mutants <= 0 ? [] : [measured.seconds / measured.mutants]

/**
 * Seconds one of `name`'s mutants takes: its own recorded seconds over its
 * recorded mutants; else the slowest such rate in the record; else
 * `unknownMutantSeconds`. An entry recorded without mutants gives no rate.
 */
export const secondsPerMutant = (record: TimingRecord, name: string, unknownMutantSeconds: number): Rate => {
  const [own] = measuredRate(record.packages[name])
  if (own !== undefined) return { seconds: own, source: 'own' }
  const rates = Object.values(record.packages).flatMap(measuredRate)
  return rates.length === 0
    ? { seconds: unknownMutantSeconds, source: 'unknown-mutant-seconds' }
    : { seconds: Math.max(...rates), source: 'slowest recorded' }
}
