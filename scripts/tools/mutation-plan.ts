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
  negated: Schema.Array(Schema.String),
  /**
   * What decides, besides `mutate`, which files Stryker mutates: the loaded config's ignore patterns, the shared ones
   * as they stood before the config ran, `since`, and the Stryker output paths the config set to non-shared values.
   */
  scope: Schema.NullOr(Schema.Struct({
    ignorePatterns: Schema.Array(Schema.String),
    sharedIgnorePatterns: Schema.Array(Schema.String),
    since: Schema.NullOr(Schema.String),
    outputs: Schema.Array(Schema.Struct({ key: Schema.String, value: Schema.String })),
  })),
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
      negated: [],
      scope: null,
    }),
  })

/**
 * A value a Mutation job gives `STRYKER_SHARD`: empty for a package it runs whole, `<index>/<count>` for a shard.
 */
export type JobShape = '' | `${number}/${number}`

/**
 * The incremental file a Mutation job passes to a package's `mutation` script (`--incrementalFile`), by its shard.
 * pnpm appends it to the script, so the script the package's config sees carries it too.
 */
export const incrementalFileOf = (shard: { readonly index: number; readonly count: number } | undefined): string =>
  shard === undefined
    ? 'reports/stryker-incremental.json'
    : `reports/stryker-incremental-${shard.index}of${shard.count}.json`

/**
 * The shapes a package is judged under before the plan decides whether to split it: whole, and `1/1`, a shard that
 * owns every file. A package the plan splits into `count` shards is judged again under each `<index>/<count>`.
 */
export const JOB_SHAPES = ['', '1/1'] as const satisfies readonly JobShape[]

export type AdmissionShape = (typeof JOB_SHAPES)[number]

export type MutationFacts = {
  readonly name: string
  readonly dir: string
  readonly scripts: Readonly<Record<string, string>>
  /** The probe's facts with `STRYKER_SHARD` set to each admission shape. */
  readonly probes: Readonly<Record<AdmissionShape, ProbeFacts>>
}

/** The job shapes a config refusal was found under, in the order they were probed, each once. */
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
  | { readonly reason: 'missing-mutation-script'; readonly package: string; readonly files: readonly string[] }
  | { readonly reason: 'hidden-workflow-file'; readonly package: string; readonly files: readonly string[] }
  | {
    readonly reason: 'shard-partition'
    readonly package: string
    readonly count: number
    readonly shards: Shapes
    readonly unmutated: readonly string[]
    readonly doubled: readonly string[]
  }
  | {
    readonly reason: 'own-ignore-patterns'
    readonly package: string
    readonly shards: Shapes
    readonly patterns: readonly string[]
  }
  | {
    readonly reason: 'ignored-workflow-file'
    readonly package: string
    readonly shards: Shapes
    readonly patterns: readonly string[]
    readonly files: readonly string[]
  }
  | { readonly reason: 'scoped-mutation'; readonly package: string; readonly shards: Shapes; readonly since: string }
  | {
    readonly reason: 'own-output-paths'
    readonly package: string
    readonly shards: Shapes
    readonly outputs: readonly { readonly key: string; readonly value: string }[]
  }

/**
 * One workspace package as the sweep sees it: whether the plan enrols it, the files of the shared mutated set it holds,
 * and the files under a hidden path the shared patterns would match but Node's glob skips. Stryker's own matcher reaches
 * those (a pattern with a dot in it admits hidden segments, and a dot-free exclude never applies to them), so the set
 * the plan sees and the set Stryker mutates part ways there.
 */
export type Swept = {
  readonly name: string
  readonly enrolled: boolean
  readonly files: readonly string[]
  readonly hidden: readonly string[]
}

export type Admitted = { readonly name: string; readonly dir: string; readonly files: readonly string[] }

export type Admission = { readonly admitted: readonly Admitted[]; readonly refusals: readonly Refusal[] }

/** The one mutation script a package may carry, as `"mutation": "stryker run"`; any `mutation:*` variant is refused. */
export const MUTATION_SCRIPT = 'stryker run'

const TEST_DIRECTORY = /(?:^|\/)(?:__tests__|__fixtures__|__mocks__)\//
const TEST_FILE = /\.(?:test|spec|tst)\.[cm]?[jt]sx?$/

const isTestFile = (file: string): boolean => TEST_DIRECTORY.test(file) || TEST_FILE.test(file)

const isMutationScript = (script: string): boolean => script === 'mutation' || script.startsWith('mutation:')

/**
 * The names Stryker's crawl always drops that Node's glob still lists under `src/`, each a name or `*.<suffix>`. Its
 * other always-ignored names are dotted directories, which Node's glob never lists, or `/stryker.log`, a root entry.
 */
const CRAWL_IGNORED_NAMES = ['node_modules', '*.tsbuildinfo']

/** Whether Stryker's crawl reads `name` (a bare name or `*.<suffix>`) as naming `segment`: at any depth, any case. */
const crawlRuleNames = (name: string, segment: string): boolean => {
  const [rule, entry] = [name.toLowerCase(), segment.toLowerCase()]
  return rule.startsWith('*.') ? entry.endsWith(rule.slice(1)) : entry === rule
}

/**
 * The shared files a crawl-ignored name drops. Stryker's crawl drops every entry whose name such a rule matches, so a
 * shared file is lost when any directory on its path is so named.
 */
const ignoredFilesOf = (files: readonly string[], ignoredNames: readonly string[]): string[] =>
  files.filter((file) =>
    file.split('/').slice(0, -1).some((segment) => ignoredNames.some((name) => crawlRuleNames(name, segment)))
  )

/**
 * The refusals of what the config sets, besides `mutate`, that changes which shared files Stryker mutates: an ignore
 * pattern the shared config does not carry, a shared one (or one Stryker always ignores) that drops a shared file,
 * `since`, and an output path set to a value other than the shared one.
 */
const scopeRefusalsOf = (pkg: string, shards: Shapes, probe: ProbeFacts): Refusal[] => {
  const { shared, scope } = probe
  if (shared === null || scope === null) return []
  const isShared = (pattern: string): boolean => scope.sharedIgnorePatterns.includes(pattern)
  const own = scope.ignorePatterns.filter((pattern) => !isShared(pattern))
  const dropping = [...scope.ignorePatterns.filter(isShared), ...CRAWL_IGNORED_NAMES]
  const ignored = ignoredFilesOf(shared.files, dropping)
  const hit = dropping.filter((name) => ignoredFilesOf(ignored, [name]).length > 0)
  return [
    ...(own.length === 0 ? [] : [{ reason: 'own-ignore-patterns' as const, package: pkg, shards, patterns: own }]),
    ...(ignored.length === 0
      ? []
      : [{ reason: 'ignored-workflow-file' as const, package: pkg, shards, patterns: hit, files: ignored }]),
    ...(scope.since === null ? [] : [{ reason: 'scoped-mutation' as const, package: pkg, shards, since: scope.since }]),
    ...(scope.outputs.length === 0
      ? []
      : [{ reason: 'own-output-paths' as const, package: pkg, shards, outputs: scope.outputs }]),
  ]
}

/**
 * The refusals one shape's facts give: the config's, `no-workflow-file` when the shared set matches nothing, and
 * `test-file-target` when the shared set itself holds a file this module counts as a test file, so the shared glob's
 * exclusions and `isTestFile` cannot drift apart.
 */
const configRefusalsOf = (pkg: string, shard: JobShape, probe: ProbeFacts): Refusal[] => {
  const { shared, own, error, config } = probe
  const shards: Shapes = [shard]
  const empty: Refusal[] = shared !== null && shared.files.length === 0
    ? [{ reason: 'no-workflow-file', package: pkg, patterns: shared.patterns }]
    : []
  const sharedTests = shared === null ? [] : shared.files.filter(isTestFile)
  const testShared: Refusal[] = sharedTests.length === 0
    ? []
    : [{ reason: 'test-file-target', package: pkg, shards, files: sharedTests }]
  if (error !== null) return [...empty, ...testShared, { reason: 'config-unloadable', package: pkg, shards, error }]
  const scoped = [...empty, ...testShared, ...scopeRefusalsOf(pkg, shards, probe)]
  if (own === null || shared === null) return scoped
  const planned = new Set(shared.files)
  const tests = own.files.filter(isTestFile)
  const nonWorkflow = own.files.filter((file) => !planned.has(file) && !isTestFile(file))
  const ownFiles = new Set(own.files)
  return [
    ...scoped,
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

/** One refusal per distinct key, naming every shape that gave it. */
const merged = (refusals: readonly Refusal[]): Refusal[] => {
  const byKey = new Map<string, Refusal>()
  for (const refusal of refusals) {
    const key = sameRefusalKey(refusal)
    const seen = byKey.get(key)
    byKey.set(key, seen === undefined ? refusal : alsoUnder(seen, refusal))
  }
  return [...byKey.values()]
}

/**
 * The shared files one shape's config leaves Stryker, or null when the shape is refused on its own: the shared set
 * minus its trailing negations (the probe admits only `!<file>` negations, each naming a shared file with no glob
 * character, as `shardMutate` appends for the files other shards own).
 */
const ownedOf = (probe: ProbeFacts): readonly string[] | null => {
  if (probe.error !== null || probe.own !== null || probe.shared === null) return null
  const negated = new Set(probe.negated)
  return probe.shared.files.filter((file) => !negated.has(file))
}

/**
 * The `shard-partition` refusal for one run of a package in `count` shards, one probe per shard: every shared file
 * must be left to exactly one of them. A config that pushes a negation onto, or pops one off, the shared array keeps
 * its identity, so only the files each shard is left show it.
 */
const partitionRefusalsOf = (
  pkg: string,
  count: number,
  probes: readonly [readonly [JobShape, ProbeFacts], ...(readonly [JobShape, ProbeFacts])[]],
): Refusal[] => {
  const owned = probes.map(([, probe]) => ownedOf(probe))
  const shared = probes[0][1].shared
  if (shared === null || owned.some((files) => files === null)) return []
  const times = new Map(shared.files.map((file) => [file, 0]))
  for (const files of owned) for (const file of files ?? []) times.set(file, (times.get(file) ?? 0) + 1)
  const unmutated = shared.files.filter((file) => times.get(file) === 0)
  const doubled = shared.files.filter((file) => (times.get(file) ?? 0) > 1)
  if (unmutated.length === 0 && doubled.length === 0) return []
  const [first, ...rest] = probes.map(([shard]) => shard)
  return [{ reason: 'shard-partition', package: pkg, count, shards: [first!, ...rest], unmutated, doubled }]
}

/**
 * The package's script refusals, and every admission shape's config refusals (each shape a whole run of one); a
 * refusal two shapes share is reported once, naming every shape that gave it.
 */
const refusalsOf = (facts: MutationFacts): Refusal[] => {
  const pkg = facts.name
  const scripts: Refusal[] = Object.entries(facts.scripts)
    .filter(([script, text]) => isMutationScript(script) && (script !== 'mutation' || text.trim() !== MUTATION_SCRIPT))
    .map(([script, text]) => ({ reason: 'mutation-script', package: pkg, script, text }))
  const configs = JOB_SHAPES.flatMap((shard) => [
    ...configRefusalsOf(pkg, shard, facts.probes[shard]),
    ...partitionRefusalsOf(pkg, 1, [[shard, facts.probes[shard]]]),
  ])
  return [...scripts, ...merged(configs)]
}

/**
 * The refusals of a package the plan splits into `probes.length` shards, judged under each `<index>/<count>` the
 * Mutation jobs will give it: each shard's config refusals, and `shard-partition` when the shards do not split the
 * shared set between them.
 */
export const splitRefusalsOf = (
  pkg: string,
  probes: readonly [readonly [JobShape, ProbeFacts], ...(readonly [JobShape, ProbeFacts])[]],
): Refusal[] =>
  merged([
    ...probes.flatMap(([shard, probe]) => configRefusalsOf(pkg, shard, probe)),
    ...partitionRefusalsOf(pkg, probes.length, probes),
  ])

/**
 * Each enrolled package's directory and the ignore patterns its config keeps under every admission shape, which are
 * what Stryker's crawl of it surely drops. A shape whose config did not load keeps none, so the sweep drops less and
 * refuses more.
 */
export const keptIgnoresOf = (packages: readonly MutationFacts[]): ReadonlyMap<string, readonly string[]> =>
  new Map(packages.map((facts) => {
    const [first, ...rest] = JOB_SHAPES.map((shape) => facts.probes[shape].scope?.ignorePatterns ?? [])
    return [facts.dir, (first ?? []).filter((pattern) => rest.every((patterns) => patterns.includes(pattern)))]
  }))

/**
 * Every package with a refusal is refused, and every refusal is kept, so one run reports them all. A package outside
 * the plan that holds a file of the shared mutated set is refused, so its workflow files cannot go unmutated, and any
 * package holding a workflow file under a hidden path is refused, so Stryker cannot mutate a file the plan never saw.
 */
export const admitMutation = (packages: readonly MutationFacts[], swept: readonly Swept[]): Admission => {
  const judged = packages.map((facts) => [facts, refusalsOf(facts)] as const)
  const missing: Refusal[] = swept.filter((pkg) => !pkg.enrolled && pkg.files.length > 0)
    .map((pkg) => ({ reason: 'missing-mutation-script', package: pkg.name, files: pkg.files }))
  const hidden: Refusal[] = swept.filter((pkg) => pkg.hidden.length > 0)
    .map((pkg) => ({ reason: 'hidden-workflow-file', package: pkg.name, files: pkg.hidden }))
  return {
    admitted: judged.filter(([, refusals]) => refusals.length === 0)
      .map(([facts]) => ({ name: facts.name, dir: facts.dir, files: facts.probes[''].shared?.files ?? [] })),
    refusals: [...judged.flatMap(([, refusals]) => refusals), ...missing, ...hidden],
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
    case 'missing-mutation-script':
      return `holds workflow files ${list(refusal.files)} but no mutation script; add "mutation": "${MUTATION_SCRIPT}"`
    case 'hidden-workflow-file':
      return `holds ${list(refusal.files)} under a hidden path, which Stryker would mutate but the shared set does ` +
        'not list; move it out of the hidden directory'
    case 'shard-partition':
      return [
        ...(refusal.unmutated.length === 0 ? [] : [`no shard of ${refusal.count} mutates ${list(refusal.unmutated)}`]),
        ...(refusal.doubled.length === 0
          ? []
          : [`more than one shard of ${refusal.count} mutates ${list(refusal.doubled)}`]),
      ].join('; ') + ` ${underShapes(refusal.shards)}; the config edits the shared mutate array in place, so ` +
        'spread sharedConfig and leave its mutate untouched'
    case 'own-ignore-patterns':
      return `ignorePatterns adds ${list(refusal.patterns)} ${underShapes(refusal.shards)}, which can drop files of ` +
        'the shared mutated set before Stryker selects them; keep only the shared ignorePatterns'
    case 'ignored-workflow-file':
      return `holds ${list(refusal.files)} under a directory named ${list(refusal.patterns)}, which Stryker's crawl ` +
        `drops ${underShapes(refusal.shards)}, so Stryker never mutates it; move it out of that directory`
    case 'scoped-mutation':
      return `sets since ${refusal.since} ${underShapes(refusal.shards)}, so Stryker mutates only changed lines; ` +
        'set no since'
    case 'own-output-paths':
      return `sets ${refusal.outputs.map(({ key, value }) => `${key} ${value}`).join(', ')} ` +
        `${underShapes(refusal.shards)}; Stryker's crawl ignores each output path, so keep the shared ones`
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
