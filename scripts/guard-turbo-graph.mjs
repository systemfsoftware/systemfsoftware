#!/usr/bin/env node
// LOCKED SURFACE — evaluation script (AGENTS.md Surface Classes).
// Never edit this file to make a turbo graph pass; fix the graph.
//
// The turbo task graph is the workspace's scheduling surface. Three defect
// classes make turbo re-execute work it already did, or execute work whose
// results cannot be trusted:
//
//   Arm 1 -- CLI passthrough in a root turbo invocation. turbo folds `-- <args>`
//     into cliArguments and hashes them into EVERY task in the run graph,
//     dependencies included. A second invocation without the args (a cache
//     restore, a parallel lane) re-executes the whole graph.
//   Arm 2 -- an env var a task script reads that `tasks.<name>.env` does not
//     declare. envMode is strict, so turbo strips it from the task environment;
//     the branch reading it is dead, and were it passed it would not be hashed,
//     so a cached log would replay under a different value.
//   Arm 3 -- a dependency cycle between packages. Turbo cannot topologically
//     order a cyclic graph and the build degrades.
//
// Why this file is LOCKED: it judges the work in this repository. Editing the
// evaluator to make the judged work pass is the exact failure the Surface
// Classes section of AGENTS.md exists to prevent. Loosening the gate needs its
// own commit and its own reason.
//
// Declared limits, stated rather than hidden:
//
//   - Arm 1 reads the root `scripts` object by regex. A turbo invocation
//     assembled from fragments or hidden behind another script is not caught;
//     green means "no literal passthrough separator in a root turbo
//     invocation".
//   - Arm 2 matches `${VAR` textually. A variable read via `$VAR` without
//     braces, or built at runtime, is not caught; a variable the script
//     assigns itself (a shell local, or an env-prefix assignment) needs no
//     task-env declaration and is deliberately skipped.
//   - Arm 3 rides `turbo query`. When turbo drops nodes from its own graph the
//     check can only miss a cycle, never invent one, so a green arm 3 is a
//     weaker claim than a red one.
//   - The guard does not check `boundaries`. `turbo query
//     'query { boundaries { length items { message reason path } } }'`
//     reports undeclared-import violations today; those are
//     dependency-declaration hygiene, not task-graph shape, and are out of
//     scope for this gate.
//   - Arm 3's exported function answers "is there a cycle" over a retained edge
//     set. Retention -- dropping untracked nodes and the `//` root -- happens
//     at the call site because turbo's graph edges carry package names, not
//     paths; the function would need a third input to do it itself.

import { parse } from '@std/jsonc'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = process.cwd()

const PASSTHROUGH = /\bturbo\b[^&;|]*\s--\s/
const ENV_REF = /\$\{([A-Z_][A-Z0-9_]*)/g
const ASSIGNED = /(^|[;&|]\s*)([A-Z_][A-Z0-9_]*)=(?!=)/g
const CLOSURE_WARNING = /Unable to calculate transitive closures: Workspace '([^']+)' not found in lockfile/g

const QUERY = 'query { packages { items { name path } } packageGraph { edges { items { source target } } } }'

/** Arm 1 — a root script that hands turbo a passthrough ` -- ` argument list. */
export const findPassthroughInvocations = (rootScripts) =>
  Object.entries(rootScripts)
    .filter(([, script]) => PASSTHROUGH.test(script))
    .map(([name, script]) => ({
      subject: name,
      script: name,
      source: script,
      reason: 'turbo folds CLI passthrough args into cliArguments and hashes them into EVERY task in the run graph, ' +
        'dependencies included; a second invocation without the args re-executes the whole graph',
      remedy:
        'drop the `-- <args>` passthrough and set the option through the task config (env, inputs, or a turbo flag without the separator)',
    }))

/**
 * Arm 2 — a task script that reads an env var the task does not declare.
 * `packages` are `{ name, scripts }` for tracked workspace packages (the root
 * `//` excluded by the caller). One violation per (task, var) pair, carrying
 * the package count and up to three example names.
 */
export const findUndeclaredTaskEnv = (turboConfig, packages) => {
  const globalEnv = new Set(turboConfig.globalEnv ?? [])
  const tasks = turboConfig.tasks ?? {}
  const byPair = new Map()

  for (const [task, config] of Object.entries(tasks)) {
    if (task.startsWith('//#')) continue
    const taskEnv = new Set(config?.env ?? [])
    for (const pkg of packages) {
      const script = pkg.scripts?.[task]
      if (typeof script !== 'string') continue
      // A variable the script assigns itself (a shell local like `F=…`, or an
      // env-prefix like `TSGO_FORMAT=… cmd`) is not read from the task
      // environment, so it needs no declaration — the plan's "built at
      // runtime" limit, made exact.
      const assigned = new Set()
      for (const match of script.matchAll(ASSIGNED)) assigned.add(match[2])
      for (const match of script.matchAll(ENV_REF)) {
        const ref = match[1]
        if (assigned.has(ref) || globalEnv.has(ref) || taskEnv.has(ref)) continue
        const key = `${task}::${ref}`
        const entry = byPair.get(key) ?? { task, var: ref, packages: [] }
        if (!entry.packages.includes(pkg.name)) entry.packages.push(pkg.name)
        byPair.set(key, entry)
      }
    }
  }

  return [...byPair.values()].map(({ task, var: ref, packages }) => ({
    subject: `${task} reads \${${ref}}`,
    task,
    var: ref,
    count: packages.length,
    examples: packages.slice(0, 3),
    reason: 'envMode is strict, so an undeclared variable is stripped from the task environment — ' +
      'the branch reading it is dead, and were it passed it would not be hashed, so a cached log would replay under a different value',
    remedy: `declare ${ref} in tasks.${task}.env (or globalEnv) in turbo.json, or stop reading it`,
  }))
}

/**
 * Arm 3 — cycles in a retained `{ source, target }` edge set, found by
 * iterative colour-marking DFS. Each cycle is reported once, as `a -> b -> a`.
 */
export const findCycles = (edges) => {
  const adjacency = new Map()
  for (const { source, target } of edges) {
    if (!adjacency.has(source)) adjacency.set(source, [])
    adjacency.get(source).push(target)
  }

  // WHITE 0 = unseen, GRAY 1 = on the current path, BLACK 2 = finished.
  const colour = new Map()
  const cycles = []
  const seen = new Set()

  for (const start of adjacency.keys()) {
    if ((colour.get(start) ?? 0) !== 0) continue
    colour.set(start, 1)
    const path = [start]
    const frames = [{ node: start, index: 0 }]
    while (frames.length > 0) {
      const frame = frames[frames.length - 1]
      const targets = adjacency.get(frame.node) ?? []
      if (frame.index >= targets.length) {
        colour.set(frame.node, 2)
        path.pop()
        frames.pop()
        continue
      }
      const next = targets[frame.index++]
      const nextColour = colour.get(next) ?? 0
      if (nextColour === 0) {
        colour.set(next, 1)
        path.push(next)
        frames.push({ node: next, index: 0 })
      } else if (nextColour === 1) {
        const cycle = [...path.slice(path.indexOf(next)), next].join(' -> ')
        if (!seen.has(cycle)) {
          seen.add(cycle)
          cycles.push(cycle)
        }
      }
    }
  }
  return cycles
}

// ── data ─────────────────────────────────────────────────────────────────────
const readJson = (rel) => JSON.parse(readFileSync(path.join(ROOT, rel), 'utf8'))

/** Every git-tracked file, repo-relative. The guard judges the checkout, never untracked scratch trees. */
const trackedPaths = () =>
  new Set(
    spawnSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).stdout.split(
      '\0',
    ).filter(Boolean),
  )

/**
 * One `turbo query` ride. turbo exits 0 even when the query fails, so the
 * stdout JSON is the verdict; stderr carries the transitive-closure warning.
 * Returns `{ fatal }` when the graph cannot be trusted at all.
 */
const queryGraph = () => {
  const turboBin = path.join(ROOT, 'node_modules', '.bin', 'turbo')
  const result = spawnSync(turboBin, ['query', QUERY], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (result.error) {
    return { fatal: `cannot run ${turboBin}: ${result.error.message}` }
  }
  const stderr = String(result.stderr ?? '')
  let parsed
  try {
    parsed = JSON.parse(String(result.stdout ?? ''))
  } catch (error) {
    return { fatal: `turbo query returned non-JSON stdout (${error.message}); stderr: ${stderr.slice(0, 400)}` }
  }
  if (parsed.data === null || (Array.isArray(parsed.errors) && parsed.errors.length > 0)) {
    return { fatal: `turbo query failed: ${JSON.stringify(parsed.errors ?? 'data is null')}` }
  }
  return {
    nodes: parsed.data.packages.items,
    edges: parsed.data.packageGraph.edges.items,
    stderr,
  }
}

// ── run ──────────────────────────────────────────────────────────────────────
const run = () => {
  const violations = []

  const rootScripts = readJson('package.json').scripts ?? {}
  for (const violation of findPassthroughInvocations(rootScripts)) violations.push(violation)

  const tracked = trackedPaths()
  const turboConfig = parse(readFileSync(path.join(ROOT, 'turbo.json'), 'utf8'))

  const graph = queryGraph()
  if (graph.fatal) {
    console.error(`guard-turbo-graph: ${graph.fatal}`)
    process.exitCode = 1
    return
  }

  for (const match of graph.stderr.matchAll(CLOSURE_WARNING)) {
    const warned = match[1]
    if (tracked.has(path.join(warned, 'package.json'))) {
      violations.push({
        subject: warned,
        reason:
          'pnpm-lock.yaml is out of date with the workspace: turbo cannot calculate transitive closures for a tracked package, so the whole graph is unreliable',
        remedy: 'run `corepack pnpm install`, commit the lockfile, re-run',
      })
    }
  }

  const isRetained = (node) => node.name !== '//' && tracked.has(path.join(node.path, 'package.json'))
  const packages = graph.nodes.filter(isRetained).map((node) => {
    const manifest = readJson(path.join(node.path, 'package.json'))
    return { name: manifest.name ?? node.name, scripts: manifest.scripts ?? {} }
  })

  for (const violation of findUndeclaredTaskEnv(turboConfig, packages)) violations.push(violation)

  const retained = new Set(graph.nodes.filter(isRetained).map((node) => node.name))
  const retainedEdges = graph.edges.filter((edge) => retained.has(edge.source) && retained.has(edge.target))
  for (const cycle of findCycles(retainedEdges)) {
    violations.push({
      subject: cycle,
      reason: 'a dependency cycle between packages — turbo cannot topologically order a cyclic graph',
      remedy: 'break the cycle (remove the edge in the direction the dependency actually runs)',
    })
  }

  if (violations.length > 0) {
    console.error('guard-turbo-graph: defects in the turbo task graph\n')
    for (const violation of violations) {
      console.error(`  ${violation.subject}`)
      if (violation.source) console.error(`    script: ${violation.source}`)
      if (violation.count) {
        console.error(`    ${violation.count} package(s) reference it (e.g. ${violation.examples.join(', ')})`)
      }
      console.error(`    ${violation.reason}`)
      console.error(`    remedy: ${violation.remedy}\n`)
    }
    console.error(
      `${violations.length} violation(s). The task graph decides what turbo re-executes and what it replays from cache.`,
    )
    console.error('See AGENTS.md Surface Classes.')
    process.exitCode = 1
    return
  }

  console.log(
    `guard-turbo-graph: ${Object.keys(rootScripts).length} root scripts, ${packages.length} tracked packages, ` +
      `${retainedEdges.length} graph edges clean — no passthrough hash poisoning, no undeclared task env, no cycle`,
  )
}

// ── selftest ─────────────────────────────────────────────────────────────────
// Each fixture is a red/green pair, so deleting an arm changes the result. The
// fixture set itself is pinned below: deleting (or renaming, or reordering) any
// fixture fails the selftest, so a stripped-down fixture list cannot paper over
// a deleted arm.
const FIXTURES = [
  {
    name: 'arm 1 catches a passthrough separator',
    fn: findPassthroughInvocations,
    args: [{ lint: 'turbo --continue lint -- --format=github' }],
    expect: 1,
  },
  {
    name: 'arm 1 passes a plain turbo invocation',
    fn: findPassthroughInvocations,
    args: [{ lint: 'turbo --continue --concurrency=50% lint' }],
    expect: 0,
  },
  {
    name: 'arm 2 catches an undeclared env var',
    fn: findUndeclaredTaskEnv,
    args: [
      { tasks: { lint: { env: ['NODE_ENV'] } }, globalEnv: [] },
      [{ name: 'pkg-a', scripts: { lint: 'oxlint . ${AGENT:+--quiet}' } }],
    ],
    expect: 1,
  },
  {
    name: 'arm 2 passes a declared env var',
    fn: findUndeclaredTaskEnv,
    args: [
      { tasks: { lint: { env: ['NODE_ENV', 'AGENT'] } }, globalEnv: [] },
      [{ name: 'pkg-a', scripts: { lint: 'oxlint . ${AGENT:+--quiet}' } }],
    ],
    expect: 0,
  },
  {
    name: 'arm 2 skips a script-local variable',
    fn: findUndeclaredTaskEnv,
    args: [
      { tasks: { lint: { env: ['NODE_ENV'] } }, globalEnv: [] },
      [{ name: 'pkg-a', scripts: { lint: 'F=${OXLINT_FORMAT:-default}; oxlint . --format=${F:-default}' } }],
    ],
    expect: 1,
  },
  {
    name: 'arm 2 declares the env a script-local default reads',
    fn: findUndeclaredTaskEnv,
    args: [
      { tasks: { lint: { env: ['NODE_ENV', 'OXLINT_FORMAT'] } }, globalEnv: [] },
      [{ name: 'pkg-a', scripts: { lint: 'F=${OXLINT_FORMAT:-default}; oxlint . --format=${F:-default}' } }],
    ],
    expect: 0,
  },
  {
    name: 'arm 3 catches a two-package cycle',
    fn: findCycles,
    args: [[{ source: 'a', target: 'b' }, { source: 'b', target: 'a' }]],
    expect: 1,
  },
  {
    name: 'arm 3 passes an acyclic edge set',
    fn: findCycles,
    args: [[{ source: 'a', target: 'b' }]],
    expect: 0,
  },
]

const FIXTURE_NAMES = [
  'arm 1 catches a passthrough separator',
  'arm 1 passes a plain turbo invocation',
  'arm 2 catches an undeclared env var',
  'arm 2 passes a declared env var',
  'arm 2 skips a script-local variable',
  'arm 2 declares the env a script-local default reads',
  'arm 3 catches a two-package cycle',
  'arm 3 passes an acyclic edge set',
]

const selftest = () => {
  const failures = []
  const names = JSON.stringify(FIXTURES.map((fixture) => fixture.name))
  if (names !== JSON.stringify(FIXTURE_NAMES)) {
    failures.push(`fixture set changed: expected ${JSON.stringify(FIXTURE_NAMES)}, got ${names}`)
  }
  for (const { name, fn, args, expect } of FIXTURES) {
    const actual = fn(...args).length
    if (actual !== expect) failures.push(`${name}: expected ${expect}, got ${actual}`)
  }
  if (failures.length > 0) {
    console.error('guard-turbo-graph selftest failed')
    for (const failure of failures) console.error(`  ${failure}`)
    process.exitCode = 1
  } else {
    console.log('guard-turbo-graph: selftest ok')
  }
}

// Entry point. Runs only when executed directly, not when imported.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--selftest')) selftest()
  else run()
}
