#!/usr/bin/env -S deno run --allow-read

// Fails when the vitest that @effect/vitest loads is not the same physical copy a
// test-chain package itself runs. Root cause this guards (issue #304): pnpm's
// optional-peer resolution can fork vitest@<version> into multiple physical copies;
// vitest's SnapshotClient is a per-copy module-global, so the runner seeds one copy's
// snapshot state and the matchers read another's, and snapshot matchers throw
// "The snapshot state ... is not found. Did you call 'SnapshotClient.setup()'?".
//
// The invariant is per-package equality (KTD2): for every test-chain importer that
// resolves @effect/vitest, realpath(<importer>/node_modules/@effect/vitest/node_modules/vitest)
// must equal realpath(<importer>/node_modules/vitest). An importer whose node_modules
// carries only the @effect/vitest copy has a single vitest — nothing to compare.
// Whole-tree instance counts are rejected: trunk legitimately carries a second
// vitest instance through storybook's transitive esbuild pin.

import { parse } from '@std/yaml'

interface Importer {
  readonly path: string
  readonly hasEffectVitest: boolean
  readonly hasVitest: boolean
  readonly links: readonly string[]
}

interface TreeView {
  /** Absolute-realpath resolver; null when the path does not exist. */
  realpath(path: string): string | null
}

interface ParsedLockfile {
  readonly importers: readonly Importer[]
  /** True when the importers section was found and parsed at all. */
  readonly parsed: boolean
}

const DEP_GROUP_KEYS = ['dependencies', 'devDependencies', 'optionalDependencies']

/**
 * Parses pnpm-lock.yaml's `importers:` section (importer path, declared dep names,
 * workspace `link:` targets). Only these shapes are read; everything else in the
 * file is ignored. Malformed YAML fails loud through `parsed: false`.
 */
export const parseLockfile = (lockfileText: string): ParsedLockfile => {
  let doc: unknown
  try {
    doc = parse(lockfileText)
  } catch {
    return { importers: [], parsed: false }
  }
  const importersDoc = doc !== null && typeof doc === 'object'
    ? (doc as Record<string, unknown>)['importers']
    : null
  if (importersDoc === null || typeof importersDoc !== 'object') {
    return { importers: [], parsed: false }
  }

  const importers = Object.entries(importersDoc as Record<string, unknown>).map(([path, block]) => {
    const deps = new Set<string>()
    const links: string[] = []
    if (block !== null && typeof block === 'object') {
      for (const [group, entries] of Object.entries(block as Record<string, unknown>)) {
        if (entries === null || typeof entries !== 'object') continue
        for (const [name, spec] of Object.entries(entries as Record<string, unknown>)) {
          if (DEP_GROUP_KEYS.includes(group)) deps.add(name)
          if (typeof spec === 'string' && spec.startsWith('link:')) links.push(spec.slice('link:'.length))
        }
      }
    }
    return {
      path,
      hasEffectVitest: deps.has('@effect/vitest'),
      hasVitest: deps.has('vitest'),
      links,
    }
  })
  return { importers, parsed: true }
}

/** Resolves a `link:` target the way the OS does: relative to the importing importer dir. */
const normalizeLink = (fromPath: string, target: string): string => {
  const out: string[] = []
  for (const segment of [...fromPath.split('/'), ...target.split('/')]) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') {
      out.pop()
      continue
    }
    out.push(segment)
  }
  return out.join('/')
}

/**
 * The vitest copy a package directory loads, found the way Node resolves it:
 * walk up from the package dir through each `node_modules/vitest` candidate.
 * In the pnpm store the copy sits at the peer level (`<virtual>/node_modules/vitest`),
 * not inside the @effect/vitest package directory.
 */
const resolveFromPackageDir = (tree: TreeView, packageRealpath: string): string | null => {
  let dir = packageRealpath
  while (true) {
    const candidate = tree.realpath(`${dir}/node_modules/vitest`)
    if (candidate !== null) return candidate
    const parent = dir.replace(/\/[^/]+$/, '')
    if (parent === dir || parent === '') return null
    dir = parent
  }
}

/** The @effect/vitest-loaded vitest copy for one importer, or null when the layout is unrecognizable. */
const edgeRealpathOf = (tree: TreeView, importerPath: string): string | null => {
  const packageRealpath = tree.realpath(`${importerPath}/node_modules/@effect/vitest`)
  if (packageRealpath === null) return null
  return resolveFromPackageDir(tree, packageRealpath)
}

/** The vitest copy the importer itself runs, or null when it declares none and its links reach none. */
const runnerRealpathOf = (tree: TreeView, importerPath: string): string | null =>
  tree.realpath(`${importerPath}/node_modules/vitest`)

const testChainOf = (importers: readonly Importer[], byPath: Map<string, Importer>): Set<string> => {
  const reached = new Set<string>()
  const queue: string[] = []
  for (const importer of importers) {
    if (!importer.hasEffectVitest || reached.has(importer.path)) continue
    reached.add(importer.path)
    queue.push(importer.path)
  }
  while (queue.length > 0) {
    const current = byPath.get(queue.shift()!)
    if (current === undefined) continue
    for (const link of current.links) {
      const target = normalizeLink(current.path, link)
      // Only importers that themselves declare @effect/vitest carry the vitest
      // binding the edge loads; other workspace links (shared tooling, lint config)
      // are not part of the test chain.
      if (byPath.get(target)?.hasEffectVitest !== true || reached.has(target)) continue
      reached.add(target)
      queue.push(target)
    }
  }
  return reached
}

export interface ForkFinding {
  readonly importerPath: string
  readonly runnerVitest: string
  readonly edgeVitest: string
}

/**
 * The pure decision: given a tree view and the lockfile text, return the list of
 * fork findings (per-package equality violations) plus loud failures. An empty
 * findings array with empty loudFailures means the install is converged.
 */
export const verdict = (
  tree: TreeView,
  lockfileText: string,
): { readonly forks: readonly ForkFinding[]; readonly loudFailures: readonly string[] } => {
  const parsed = parseLockfile(lockfileText)
  if (!parsed.parsed) {
    return {
      forks: [],
      loudFailures: [
        'pnpm-lock.yaml has no importers section — the guard cannot read this lockfile; re-derive the invariant',
      ],
    }
  }

  const byPath = new Map<string, Importer>(parsed.importers.map((importer) => [importer.path, importer]))
  const chain = testChainOf(parsed.importers, byPath)

  const loudFailures: string[] = []
  if (chain.size === 0) {
    return {
      forks: [],
      loudFailures: [
        'no workspace package resolves @effect/vitest — the gate scanned nothing, so its silence proves nothing',
      ],
    }
  }

  const forks: ForkFinding[] = []
  for (const path of chain) {
    const importer = byPath.get(path)!
    const edge = edgeRealpathOf(tree, path)
    if (edge === null) {
      loudFailures.push(
        `${path}: @effect/vitest is declared but its nested vitest is missing — unrecognized layout; re-derive the invariant against this pnpm/vitest layout`,
      )
      continue
    }

    const runner = importer.hasVitest ? runnerRealpathOf(tree, path) : null
    if (runner === null) {
      if (importer.hasVitest) {
        loudFailures.push(`${path}: declares vitest but node_modules has no vitest — install is missing or incomplete`)
      }
      // Edge-only package (no own vitest, links reach none): a single vitest copy,
      // nothing to compare against — not a fork.
      continue
    }

    if (runner !== edge) forks.push({ importerPath: path, runnerVitest: runner, edgeVitest: edge })
  }

  return { forks, loudFailures }
}

const fsView = (root: string): TreeView => {
  const cache = new Map<string, string | null>()
  return {
    realpath(path: string): string | null {
      const joined = path.startsWith('/') ? path : `${root}/${path}`
      const cached = cache.get(joined)
      if (cached !== undefined) return cached
      let resolved: string | null
      try {
        resolved = Deno.realPathSync(joined)
      } catch {
        resolved = null
      }
      cache.set(joined, resolved)
      return resolved
    },
  }
}

const selftest = (): number => {
  const failures: string[] = []

  const importerBlock = (path: string, entries: readonly string[]): string => {
    if (entries.length === 0) return `  ${path}:\n`
    const body = entries.map((entry) => `      ${entry}\n        version: 1.0.0\n`).join('')
    return `  ${path}:\n    devDependencies:\n${body}`
  }

  const vitestDep = (name: string): string => `'${name}':`
  const lockfileOf = (importers: readonly string[]): string => `importers:\n${importers.join('')}\n`

  const mapOf = (mappings: readonly (readonly [string, string])[]): TreeView => {
    const byPath = new Map<string, string>(mappings)
    return { realpath: (path) => byPath.get(path) ?? null }
  }

  // The virtual-store walk-up shape: the @effect/vitest package symlink resolves into
  // .pnpm, and its vitest copy sits at the peer level one directory up.
  const evMappings = (
    pkg: string,
    copy: string,
  ): readonly (readonly [string, string])[] => {
    const storeDir = `/store/ev-${pkg.replace(/\//g, '-')}`
    return [
      [`${pkg}/node_modules/vitest`, copy],
      [`${pkg}/node_modules/@effect/vitest`, `${storeDir}/node_modules/@effect/vitest`],
      [`${storeDir}/node_modules/vitest`, copy],
    ]
  }

  // 1. Converged: runner and edge agree.
  const convergedLock = lockfileOf([
    importerBlock('packages/a', [vitestDep('vitest'), vitestDep('@effect/vitest')]),
  ])
  const converged = verdict(mapOf(evMappings('packages/a', '/store/vitest-A')), convergedLock)
  if (converged.forks.length !== 0 || converged.loudFailures.length !== 0) {
    failures.push(`converged tree was rejected: ${JSON.stringify(converged)}`)
  }

  // 2. Forked: the edge lands on a different physical copy than the runner.
  const forkedLock = lockfileOf([
    importerBlock('packages/a', [vitestDep('vitest'), vitestDep('@effect/vitest')]),
  ])
  const forkedTree = mapOf([
    ['packages/a/node_modules/vitest', '/store/vitest-A'],
    ['packages/a/node_modules/@effect/vitest', '/store/ev-packages-a/node_modules/@effect/vitest'],
    ['/store/ev-packages-a/node_modules/vitest', '/store/vitest-B'],
  ])
  const forked = verdict(forkedTree, forkedLock)
  if (forked.forks.length !== 1 || forked.loudFailures.length !== 0) {
    failures.push(`forked tree was not flagged: ${JSON.stringify(forked)}`)
  }

  // 3. Cross-package consistency: two packages on different copies, each internally
  //    consistent, must pass — per-package equality, not union membership.
  const crossLock = lockfileOf([
    importerBlock('packages/a', [vitestDep('vitest'), vitestDep('@effect/vitest')]),
    importerBlock('packages/b', [vitestDep('vitest'), vitestDep('@effect/vitest')]),
  ])
  const cross = verdict(
    mapOf([...evMappings('packages/a', '/store/vitest-A'), ...evMappings('packages/b', '/store/vitest-B')]),
    crossLock,
  )
  if (cross.forks.length !== 0 || cross.loudFailures.length !== 0) {
    failures.push(`cross-package consistent tree was rejected: ${JSON.stringify(cross)}`)
  }

  // 4. Non-fork noise: an unrelated importer's own vitest copy does not affect the chain.
  const noiseLock = lockfileOf([
    importerBlock('packages/a', [vitestDep('vitest'), vitestDep('@effect/vitest')]),
    importerBlock('packages/storybook-thing', [vitestDep('vitest')]),
  ])
  const noiseTree = mapOf([
    ...evMappings('packages/a', '/store/vitest-A'),
    ['packages/storybook-thing/node_modules/vitest', '/store/vitest-C'],
  ])
  const noise = verdict(noiseTree, noiseLock)
  if (noise.forks.length !== 0 || noise.loudFailures.length !== 0) {
    failures.push(`unrelated third instance caused a failure: ${JSON.stringify(noise)}`)
  }

  // 5. Unrecognized layout: @effect/vitest declared, its package dir missing → loud fail.
  const unrecognizedTree = mapOf([
    ['packages/a/node_modules/vitest', '/store/vitest-A'],
  ])
  const unrecognized = verdict(
    unrecognizedTree,
    lockfileOf([
      importerBlock('packages/a', [vitestDep('vitest'), vitestDep('@effect/vitest')]),
    ]),
  )
  if (unrecognized.loudFailures.length !== 1 || !unrecognized.loudFailures[0].includes('re-derive')) {
    failures.push(`unrecognized layout did not fail loud: ${JSON.stringify(unrecognized)}`)
  }

  const transitiveLock = lockfileOf([
    importerBlock('packages/a', [vitestDep('vitest'), vitestDep('@effect/vitest')]),
    importerBlock('packages/spec', [vitestDep('@effect/vitest')]),
    `  packages/consumer:\n    dependencies:\n      '@systemfsoftware/spec':\n        version: link:../spec\n`,
  ])
  const transitive = verdict(
    mapOf([
      ...evMappings('packages/a', '/store/vitest-A'),
      ...evMappings('packages/spec', '/store/vitest-A'),
    ]),
    transitiveLock,
  )
  if (transitive.forks.length !== 0 || transitive.loudFailures.length !== 0) {
    failures.push(`transitive-only consumer caused a failure: ${JSON.stringify(transitive)}`)
  }

  // 7. Zero test chain: no importer resolves @effect/vitest → loud fail (scanned nothing).
  const empty = verdict(mapOf([]), lockfileOf([importerBlock('packages/a', [vitestDep('vitest')])]))
  if (empty.loudFailures.length !== 1 || !empty.loudFailures[0].includes('scanned nothing')) {
    failures.push(`zero test chain did not fail loud: ${JSON.stringify(empty)}`)
  }

  if (failures.length > 0) {
    for (const failure of failures) console.error(`selftest: ${failure}`)
    console.error(`selftest FAILED: ${failures.length} case(s)`)
    return 1
  }

  console.log('selftest ok: 7 cases')
  return 0
}

if (import.meta.main) {
  if (Deno.args.includes('--selftest')) Deno.exit(selftest())

  const rootArgIndex = Deno.args.indexOf('--root')
  const root = rootArgIndex >= 0 ? Deno.args[rootArgIndex + 1]! : Deno.cwd()

  const lockfileText = await Deno.readTextFile(`${root}/pnpm-lock.yaml`).catch(() => null)
  if (lockfileText === null) {
    console.error(`::error::pnpm-lock.yaml not found under ${root} — run from the repo root or pass --root`)
    Deno.exit(1)
  }

  const { forks, loudFailures } = verdict(fsView(root), lockfileText)

  for (const loud of loudFailures) console.error(`::error::${root}: ${loud}`)
  for (const fork of forks) {
    console.error(
      `::error::${fork.importerPath}: @effect/vitest loads vitest at ${fork.edgeVitest} but the package runs vitest at ${fork.runnerVitest} — duplicate vitest instance; repair with \`pnpm dedupe\``,
    )
  }

  if (forks.length > 0 || loudFailures.length > 0) {
    console.error(
      `\n${
        forks.length + loudFailures.length
      } vitest instance violation(s). The vitest that @effect/vitest loads must be the same physical copy each test-chain package runs.`,
    )
    Deno.exit(1)
  }

  console.log('check-single-vitest: test chain converged — @effect/vitest loads the same vitest copy each package runs')
}
