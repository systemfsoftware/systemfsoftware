#!/usr/bin/env -S deno run --allow-read --allow-run=git
// LOCKED SURFACE — evaluation script (AGENTS.md Surface Classes).
// Never edit this file to make a turbo config pass; fix the config.
//
// Two defects, both invisible to every other observer in this repo, both
// silent, and both about WHAT TURBO HASHES:
//
//   Arm 1 — a passthrough `-- <args>` in a root turbo invocation. turbo folds
//     those args into cliArguments and hashes them into EVERY task in the run
//     graph, dependencies included, so a second invocation without them
//     re-executes the whole graph. Measured on this repo before the lane was
//     deleted: 0/50 build hashes shared between the two lanes, ~47 builds and
//     ~46 lints executed twice per CI run.
//   Arm 2 — a task script reading an env var `tasks.<name>.env` does not
//     declare. envMode is strict, so turbo strips it: the branch reading it is
//     dead. Were it passed instead, it would not be hashed, so a cached log
//     would replay under a different value. Both failures are silent.
//     The converse is equally silent and this guard cannot see it: a DECLARED
//     variable is hashed BY VALUE, so declaring one that differs per caller
//     (AGENT, set in agent sessions, unset for humans) forks the task cache into
//     disjoint keyspaces. Measured here: declaring AGENT dropped lint hash
//     sharing to 0/50. Declare only variables whose value is a real input.
//
// What this file deliberately does NOT check, and why — a gate suite's
// affordability is N x p, so every arm that buys nothing taxes every other gate
// in the suite:
//
//   - Package cycles. `turbo` refuses a cyclic graph itself, exits 1, and names
//     which dependency sets would break it. Re-checking that is a slot in the
//     budget for zero coverage, and it cost a `turbo query` spawn per run.
//   - `boundaries` (undeclared imports). Dependency-declaration hygiene, not
//     hash inputs; a separate concern with its own channel.
//
// Why this file is LOCKED: it judges the work in this repository. Editing the
// evaluator to make the judged work pass is the failure the Surface Classes
// section of AGENTS.md exists to prevent.
//
// Declared limits, stated rather than hidden:
//
//   - Arm 1 matches a literal ` -- ` after a `turbo` word in a root script
//     string. An invocation assembled from fragments, or hidden behind another
//     script, is not caught; green means "no literal passthrough separator in a
//     root turbo invocation".
//   - Arm 2 matches `${VAR` textually, and skips any variable the script assigns
//     itself (a shell local, or an env-prefix assignment). A variable read as
//     bare `$VAR`, or built at runtime, is not caught. This arm has already
//     produced one false positive in development — a shell local — so its skip
//     rule is load-bearing, not decoration.
//   - Both arms judge the repository as checked out: a package counts only when
//     its `package.json` is git-tracked, so the verdict is identical in CI, in a
//     worktree, and in a developer's dirty tree.

import { parse } from '@std/jsonc'
import { workspaceMembers } from './workspace-members.ts'

const ROOT = Deno.cwd()

const PASSTHROUGH = /\bturbo\b[^&;|]*\s--\s/
const ENV_REF = /\$\{([A-Z_][A-Z0-9_]*)/g
const ASSIGNED = /(^|[;&|]\s*)([A-Z_][A-Z0-9_]*)=(?!=)/g

/** Arm 1 — a root script that hands turbo a passthrough argument list. */
export const findPassthroughInvocations = (rootScripts) =>
  Object.entries(rootScripts)
    .filter(([, script]) => PASSTHROUGH.test(script))
    .map(([name, script]) => ({
      subject: name,
      detail: `script: ${script}`,
      reason:
        'turbo hashes CLI passthrough args into EVERY task in the run graph, dependencies included; a second invocation without them re-executes the whole graph',
      remedy: 'drop the `-- <args>` passthrough and carry the option in the task config (env or inputs)',
    }))

/**
 * Arm 2 — a task script reading an env var the task does not declare.
 * `packages` are `{ name, scripts }`; one violation per (task, var) pair.
 */
export const findUndeclaredTaskEnv = (turboConfig, packages) => {
  const globalEnv = new Set(turboConfig.globalEnv ?? [])
  const byPair = new Map()

  for (const [task, config] of Object.entries(turboConfig.tasks ?? {})) {
    if (task.startsWith('//#')) continue
    const declared = new Set([...globalEnv, ...(config?.env ?? [])])
    for (const pkg of packages) {
      const script = pkg.scripts?.[task]
      if (typeof script !== 'string') continue
      const assigned = new Set([...script.matchAll(ASSIGNED)].map((match) => match[2]))
      for (const [, ref] of script.matchAll(ENV_REF)) {
        if (assigned.has(ref) || declared.has(ref)) continue
        const entry = byPair.get(`${task}::${ref}`) ?? { task, ref, packages: [] }
        if (!entry.packages.includes(pkg.name)) entry.packages.push(pkg.name)
        byPair.set(`${task}::${ref}`, entry)
      }
    }
  }

  return [...byPair.values()].map(({ task, ref, packages }) => ({
    subject: `${task} reads \${${ref}}`,
    detail: `${packages.length} package(s), e.g. ${packages.slice(0, 3).join(', ')}`,
    reason:
      'envMode is strict, so an undeclared variable is stripped: the branch reading it is dead, and were it passed it would not be hashed, so a cached log would replay under a different value',
    remedy:
      `declare ${ref} in tasks.${task}.env — only if its value is a real input, since a declared variable is hashed by value and one that varies per caller forks the cache — or stop reading it`,
  }))
}

/** The chains that compose the repo's gates; a guard reaches CI through one of these. */
const CHAINS = ['check:ci', 'check:local']

/**
 * `check:turbo-graph` validates turbo's own config, so it must run before turbo
 * does and cannot be one of turbo's tasks. Every other entry here would be a
 * guard nobody caches, so the list stays at one and each addition states why.
 */
const PRE_TURBO = new Set(['check:turbo-graph'])

const CHAIN_INVOKES = /\bpnpm\s+(check:[\w:-]+)/g

/**
 * Arm 3 — a guard a chain invokes directly instead of through turbo. Run that
 * way it has no inputs to hash, so it re-executes on every run and nothing
 * reports the waste. An existing `//#` task does not excuse the bare call: the
 * chain then pays for the script twice, once uncached here and once from the
 * cache in gate:tasks. One violation per (chain, script) pair.
 */
export const findUncachedChainGuards = (rootScripts, turboConfig) => {
  const rootTasks = new Set(
    Object.keys(turboConfig.tasks ?? {}).filter((task) => task.startsWith('//#')).map((task) => task.slice(3)),
  )
  const violations = []
  for (const chain of CHAINS) {
    const script = rootScripts[chain]
    if (typeof script !== 'string') continue
    for (const [, name] of script.matchAll(CHAIN_INVOKES)) {
      if (PRE_TURBO.has(name) || !(name in rootScripts)) continue
      const cached = rootTasks.has(name)
      violations.push({
        subject: `${chain} -> ${name}`,
        detail: cached
          ? `invoked as \`pnpm ${name}\` even though \`//#${name}\` exists`
          : `invoked as \`pnpm ${name}\`, and no \`//#${name}\` task exists`,
        reason: cached
          ? 'the chain runs the script uncached here and again from the cache in gate:tasks, paying twice for one verdict'
          : 'a guard outside turbo has no inputs to hash, so it re-executes on every run while every cached sibling is skipped',
        remedy: cached
          ? `drop the chain arm; gate:tasks already runs \`//#${name}\``
          : `declare \`//#${name}\` in turbo.json with the inputs it reads, then run it from gate:tasks instead of the chain`,
      })
    }
  }
  return violations
}

const dec = new TextDecoder()

/** Tracked `package.json` paths, vendored trees excluded: `git ls-files` is the authority. */
const trackedManifests = () => {
  const out = new Deno.Command('git', {
    args: ['ls-files', '*package.json', ':(exclude)repos/**'],
    stdout: 'piped',
    stderr: 'null',
  }).outputSync()
  return dec.decode(out.stdout).split('\n').filter(Boolean)
}

const run = () => {
  const readJson = (rel) => JSON.parse(Deno.readTextFileSync(`${ROOT}/${rel}`))
  const rootScripts = readJson('package.json').scripts ?? {}
  const turboConfig = parse(Deno.readTextFileSync(`${ROOT}/turbo.json`))

  const packages = workspaceMembers(trackedManifests())
    .map((rel) => readJson(rel))
    .map((manifest) => ({ name: manifest.name, scripts: manifest.scripts ?? {} }))

  const violations = [
    ...findPassthroughInvocations(rootScripts),
    ...findUndeclaredTaskEnv(turboConfig, packages),
    ...findUncachedChainGuards(rootScripts, turboConfig),
  ]

  if (violations.length > 0) {
    console.error('guard-turbo-graph: defects in what turbo hashes\n')
    for (const { subject, detail, reason, remedy } of violations) {
      console.error(`  ${subject}\n    ${detail}\n    ${reason}\n    remedy: ${remedy}\n`)
    }
    console.error(`${violations.length} violation(s). See AGENTS.md Surface Classes.`)
    return 1
  }

  console.log(
    `guard-turbo-graph: ${Object.keys(rootScripts).length} root scripts, ${packages.length} workspace packages clean` +
      ' — no passthrough hash poisoning, no undeclared task env, no uncached chain guard',
  )
  return 0
}

// ── selftest ─────────────────────────────────────────────────────────────────
// A red/green pair per arm, plus the false positive this guard actually
// produced, plus the nesting rule that keeps fixtures out of arm 2. The fixture
// set is pinned: deleting or renaming one fails here, so a trimmed list cannot
// paper over a deleted arm.
const FIXTURES = [
  [
    'arm 1 catches a passthrough separator',
    findPassthroughInvocations,
    [{ lint: 'turbo --continue lint -- --format=github' }],
    1,
  ],
  [
    'arm 1 passes a plain turbo invocation',
    findPassthroughInvocations,
    [{ lint: 'turbo --continue --concurrency=50% lint' }],
    0,
  ],
  [
    'arm 2 catches an undeclared env var',
    findUndeclaredTaskEnv,
    [{ tasks: { lint: { env: ['NODE_ENV'] } } }, [{ name: 'pkg-a', scripts: { lint: 'oxlint . ${AGENT:+--quiet}' } }]],
    1,
  ],
  [
    'arm 2 passes a declared env var',
    findUndeclaredTaskEnv,
    [{ tasks: { lint: { env: ['AGENT'] } } }, [{ name: 'pkg-a', scripts: { lint: 'oxlint . ${AGENT:+--quiet}' } }]],
    0,
  ],
  [
    'arm 2 skips a shell local, the false positive it once produced',
    findUndeclaredTaskEnv,
    [
      { tasks: { lint: { env: ['OXLINT_FORMAT'] } } },
      [{ name: 'pkg-a', scripts: { lint: 'F=${OXLINT_FORMAT:-default}; oxlint . --format=${F:-default}' } }],
    ],
    0,
  ],
  [
    'arm 3 catches a chain guard turbo never caches',
    findUncachedChainGuards,
    [{ 'check:local': 'pnpm check:hooks || s=1', 'check:hooks': 'deno task check' }, { tasks: {} }],
    1,
  ],
  [
    'arm 3 passes a guard reached through its root task',
    findUncachedChainGuards,
    [{ 'check:local': 'pnpm gate:tasks', 'check:hooks': 'deno task check' }, { tasks: { '//#check:hooks': {} } }],
    0,
  ],
  [
    'arm 3 catches a bare call that duplicates an existing root task, the case that first escaped it',
    findUncachedChainGuards,
    [
      { 'check:local': 'pnpm check:hooks || s=1; pnpm gate:tasks', 'check:hooks': 'deno task check' },
      { tasks: { '//#check:hooks': {} } },
    ],
    1,
  ],
  [
    'arm 3 exempts the guard that must run before turbo',
    findUncachedChainGuards,
    [{ 'check:local': 'pnpm check:turbo-graph || s=1', 'check:turbo-graph': './g.mjs' }, { tasks: {} }],
    0,
  ],
  [
    'a manifest nested under a package is not a workspace member',
    workspaceMembers,
    [['package.json', 'packages/a/package.json', 'packages/a/test/fixtures/b/package.json']],
    1,
  ],
]

const FIXTURE_NAMES = [
  'arm 1 catches a passthrough separator',
  'arm 1 passes a plain turbo invocation',
  'arm 2 catches an undeclared env var',
  'arm 2 passes a declared env var',
  'arm 2 skips a shell local, the false positive it once produced',
  'arm 3 catches a chain guard turbo never caches',
  'arm 3 passes a guard reached through its root task',
  'arm 3 catches a bare call that duplicates an existing root task, the case that first escaped it',
  'arm 3 exempts the guard that must run before turbo',
  'a manifest nested under a package is not a workspace member',
]

const selftest = () => {
  const failures = FIXTURES.filter(([, fn, args, expect]) => fn(...args).length !== expect).map(([name]) => name)
  if (JSON.stringify(FIXTURES.map(([name]) => name)) !== JSON.stringify(FIXTURE_NAMES)) {
    failures.push(`fixture set changed: expected ${JSON.stringify(FIXTURE_NAMES)}`)
  }
  if (failures.length > 0) {
    console.error('guard-turbo-graph selftest failed')
    for (const failure of failures) console.error(`  ${failure}`)
    return 1
  }
  console.log('guard-turbo-graph: selftest ok')
  return 0
}

if (import.meta.main) {
  Deno.exitCode = Deno.args.includes('--selftest') ? selftest() : run()
}
