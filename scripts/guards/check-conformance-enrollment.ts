#!/usr/bin/env -S deno run --allow-read
/**
 * Guard: every workspace package whose PRODUCTION source forks fibers, holds
 * `Queue`/`Deferred`/`Ref`/`Semaphore` state, or acquires scoped resources runs
 * its tests through the shared `@systemfsoftware/vitest-config` `defineConfig`
 * (R29 enrollment).
 *
 * Coverage is judged inside every vitest run: that config's `defineConfig` adds
 * a plugin that fails a run when a concurrency-primitive site in the package's
 * source never executed under a conformance check. The plugin cannot see a
 * package that never runs vitest through `defineConfig`, so enrollment is the
 * only thing left for a guard to check.
 *
 * The enrolled set is derived from source, never from a hand-kept list: only a
 * package's `src/`, excluding test files (`*.test.ts`, `*.spec.ts`,
 * `*.stories.tsx`, `tests/`, `__tests__/`, `__fixtures__/`) and the trailing
 * in-source `if (import.meta.vitest !== void 0) { ... }` block this repo keeps
 * its in-source tests in.
 *
 * Detection is import-provenance aware. A `Ref.`/`Queue.`/`Deferred.`/
 * `Semaphore.`/`Effect.`/`Layer.`/`Stream.`/`Scope.` member use counts only
 * when that local was bound by a static import OR a guard-local dynamic
 * `await import('effect/…')` — the idiom a static-only tracker misses
 * (`docs/solutions/architecture-patterns/dynamic-import-blinds-static-provenance-rules.md`).
 * Only lowercase members count, so a type position (`Ref.Ref<A>`) is not a
 * value use.
 *
 * The guard fails for a package whose source holds at least one primitive and:
 *   1. declares no `test` script that runs `vitest`; or
 *   2. has no `vitest.config.ts|.mts|.js` that imports `defineConfig` from
 *      '@systemfsoftware/vitest-config'.
 *
 * Usage:
 *   deno run --allow-read scripts/guards/check-conformance-enrollment.ts
 *   deno run --allow-read scripts/guards/check-conformance-enrollment.ts --selftest
 */
import { dirname, fromFileUrl, join, relative, resolve } from '@std/path'
import { parse } from '@std/yaml'

export type Primitive = 'fork' | 'queue' | 'deferred' | 'ref' | 'semaphore' | 'scoped'

export const PRIMITIVES: readonly Primitive[] = ['fork', 'queue', 'deferred', 'ref', 'semaphore', 'scoped']

export type SourceFile = { readonly path: string; readonly text: string }

export type PrimitiveHit = {
  readonly primitive: Primitive
  readonly path: string
  readonly line: number
  readonly token: string
}

export type PackageEvidence = {
  readonly name: string
  readonly dir: string
  /** `scripts.test` from the package manifest, if it declares one. */
  readonly testScript: string | undefined
  /** Repo-relative path + text of each vitest config the package holds. */
  readonly vitestConfigs: readonly SourceFile[]
  readonly hits: readonly PrimitiveHit[]
}

export type Problem = {
  readonly package: string
  readonly detail: string
  /** First primitive site in the package, as `path:line (token)`. */
  readonly evidence: string
}

export type Verdict = { readonly ok: boolean; readonly problems: readonly Problem[] }

// ---------------------------------------------------------------------------
// Source filter
// ---------------------------------------------------------------------------

const SOURCE_FILE = /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/
const DECLARATION_FILE = /\.d\.(?:ts|mts|cts)$/
const IGNORED_DIR = /(?:^|\/)(?:node_modules|dist|coverage|\.turbo|\.git|__snapshots__)(?:\/|$)/
const TEST_DIR = /(?:^|\/)(?:tests?|__tests__|__fixtures__)(?:\/|$)/
const TEST_FILE = /\.(?:test|spec|stories)\.[cm]?[jt]sx?$/

/** True for a TypeScript/JavaScript file that is production source, not a test. */
export const isProductionSource = (path: string): boolean => {
  const p = path.replace(/\\/g, '/')
  if (!SOURCE_FILE.test(p) || DECLARATION_FILE.test(p)) return false
  if (IGNORED_DIR.test(p) || TEST_DIR.test(p) || TEST_FILE.test(p)) return false
  return true
}

const IN_SOURCE_TEST_MARKER = /^[ \t]*if\s*\(\s*import\.meta\.vitest/

/**
 * Drops the trailing in-source test block. This repo keeps it last in the file
 * (`if (import.meta.vitest !== void 0) { ... }`), never mid-module.
 */
export const stripInSourceTestBlock = (text: string): string => {
  const lines = text.split('\n')
  const start = lines.findIndex((line) => IN_SOURCE_TEST_MARKER.test(line))
  return start === -1 ? text : lines.slice(0, start).join('\n')
}

const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//g
const blank = (match: string): string => match.replace(/[^\n]/g, ' ')

/** Blanks block comments (JSDoc code fences mention primitives without using them). */
export const stripBlockComments = (text: string): string => text.replace(BLOCK_COMMENT, blank)

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

type Binding = { readonly local: string; readonly specifier: string; readonly imported: string | null }

const STATIC_NAMESPACE = /import\s*\*\s*as\s+([A-Za-z_$][\w$]*)\s*from\s*['"]([^'"]+)['"]/g
const STATIC_NAMED = /import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g
const DYNAMIC_NAMESPACE = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*await\s+import\s*\(\s*['"]([^'"]+)['"]\s*\)/g
const DYNAMIC_NAMED = /(?:const|let|var)\s*\{([^}]*)\}\s*=\s*await\s+import\s*\(\s*['"]([^'"]+)['"]\s*\)/g

const parseNamedClause = (clause: string): readonly { readonly imported: string; readonly local: string }[] =>
  clause.split(',').flatMap((part) => {
    const entry = part.trim().replace(/^type\s+/, '')
    if (entry.length === 0) return []
    const as = entry.split(/\s+as\s+/)
    if (as.length === 2) return [{ imported: as[0].trim(), local: as[1].trim() }]
    const colon = entry.split(':')
    if (colon.length === 2) return [{ imported: colon[0].trim(), local: colon[1].trim() }]
    return [{ imported: entry, local: entry }]
  })

export const extractBindings = (code: string): readonly Binding[] => {
  const bindings: Binding[] = []
  for (const m of code.matchAll(STATIC_NAMESPACE)) bindings.push({ local: m[1], specifier: m[2], imported: null })
  for (const m of code.matchAll(STATIC_NAMED)) {
    for (const e of parseNamedClause(m[1])) bindings.push({ local: e.local, specifier: m[2], imported: e.imported })
  }
  for (const m of code.matchAll(DYNAMIC_NAMESPACE)) bindings.push({ local: m[1], specifier: m[2], imported: null })
  for (const m of code.matchAll(DYNAMIC_NAMED)) {
    for (const e of parseNamedClause(m[1])) bindings.push({ local: e.local, specifier: m[2], imported: e.imported })
  }
  return bindings
}

type Role =
  | { readonly kind: 'primitive'; readonly primitive: Primitive }
  | { readonly kind: 'effect' }
  | { readonly kind: 'layer' }
  | { readonly kind: 'stream' }
  | { readonly kind: 'scope' }
  | { readonly kind: 'callable'; readonly primitive: Primitive }

const MODULE_ROLE: Readonly<Record<string, Role>> = {
  Queue: { kind: 'primitive', primitive: 'queue' },
  Deferred: { kind: 'primitive', primitive: 'deferred' },
  Ref: { kind: 'primitive', primitive: 'ref' },
  Semaphore: { kind: 'primitive', primitive: 'semaphore' },
  Effect: { kind: 'effect' },
  Layer: { kind: 'layer' },
  Stream: { kind: 'stream' },
  Scope: { kind: 'scope' },
}

const callablePrimitive = (imported: string): Primitive | null => {
  if (/^fork/.test(imported)) return 'fork'
  if (/^(?:acquireRelease[A-Za-z]*|acquireUseRelease|addFinalizer|scoped)$/.test(imported)) return 'scoped'
  return null
}

export const roleOf = (binding: Binding): Role | null => {
  if (!/^effect(?:\/|$)/.test(binding.specifier)) return null
  if (binding.imported === null) {
    const leaf = binding.specifier === 'effect'
      ? 'Effect'
      : binding.specifier.slice(binding.specifier.lastIndexOf('/') + 1)
    return MODULE_ROLE[leaf] ?? null
  }
  const direct = MODULE_ROLE[binding.imported]
  if (direct !== undefined) return direct
  const callable = callablePrimitive(binding.imported)
  return callable === null ? null : { kind: 'callable', primitive: callable }
}

const escapeRe = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const lineAt = (text: string, index: number): number => {
  let line = 1
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) line++
  return line
}

const SCANNERS: Readonly<Record<Exclude<Role['kind'], 'primitive' | 'callable'>, RegExp>> = {
  effect: /(fork[A-Za-z0-9_$]*|acquireRelease[A-Za-z0-9_$]*|acquireUseRelease|addFinalizer|scoped)\b/g,
  layer: /(scoped|scopedDiscard)\b/g,
  stream: /(acquireRelease[A-Za-z0-9_$]*)\b/g,
  scope: /(addFinalizer[A-Za-z0-9_$]*)\b/g,
}

const scanBinding = (code: string, binding: Binding, role: Role, path: string): readonly PrimitiveHit[] => {
  const hits: PrimitiveHit[] = []
  const push = (primitive: Primitive, index: number, token: string): void => {
    hits.push({ primitive, path, line: lineAt(code, index), token })
  }
  const local = escapeRe(binding.local)

  if (role.kind === 'callable') {
    for (const m of code.matchAll(new RegExp(`\\b${local}\\s*\\(`, 'g'))) {
      push(role.primitive, m.index, `${binding.local}(`)
    }
    return hits
  }

  if (role.kind === 'primitive') {
    for (const m of code.matchAll(new RegExp(`\\b${local}\\s*\\.\\s*([a-z][A-Za-z0-9_$]*)`, 'g'))) {
      push(role.primitive, m.index, `${binding.local}.${m[1]}`)
    }
    return hits
  }

  const matcher = new RegExp(`\\b${local}\\s*\\.\\s*${SCANNERS[role.kind].source}`, 'g')
  for (const m of code.matchAll(matcher)) {
    const member = m[1]
    const primitive: Primitive = role.kind === 'effect' ? (member.startsWith('fork') ? 'fork' : 'scoped') : 'scoped'
    push(primitive, m.index, `${binding.local}.${member}`)
  }
  return hits
}

export const detectPrimitives = (files: readonly SourceFile[]): readonly PrimitiveHit[] => {
  const seen = new Set<string>()
  const hits: PrimitiveHit[] = []
  for (const file of files) {
    const code = stripBlockComments(stripInSourceTestBlock(file.text))
    for (const binding of extractBindings(code)) {
      const role = roleOf(binding)
      if (role === null) continue
      for (const hit of scanBinding(code, binding, role, file.path)) {
        const key = `${hit.primitive}\u0000${hit.path}\u0000${hit.line}\u0000${hit.token}`
        if (seen.has(key)) continue
        seen.add(key)
        hits.push(hit)
      }
    }
  }
  return hits.sort((a, b) => (a.path === b.path ? a.line - b.line : a.path.localeCompare(b.path)))
}

export const primitivesOf = (hits: readonly PrimitiveHit[]): readonly Primitive[] =>
  [...new Set(hits.map((hit) => hit.primitive))].sort()

// ---------------------------------------------------------------------------
// Enrollment
// ---------------------------------------------------------------------------

/** The shared config whose `defineConfig` installs the conformance gate. */
export const SHARED_CONFIG_PACKAGE = '@systemfsoftware/vitest-config'

export const VITEST_CONFIG_FILE = /(?:^|\/)vitest\.config\.(?:ts|mts|js)$/

export const ENROLLMENT_FIX =
  'run its tests with vitest through defineConfig from @systemfsoftware/vitest-config; that run fails while any primitive site never executes under a conformance check'

/** True when a manifest `test` script invokes vitest. */
export const runsVitest = (script: string | undefined): boolean => script !== undefined && /\bvitest\b/.test(script)

/** True when the config source imports `defineConfig` from the shared package. */
export const usesSharedDefineConfig = (text: string): boolean =>
  extractBindings(text).some((binding) =>
    (binding.specifier === SHARED_CONFIG_PACKAGE || binding.specifier.startsWith(`${SHARED_CONFIG_PACKAGE}/`)) &&
    binding.imported === 'defineConfig'
  )

export const evaluate = (packages: readonly PackageEvidence[]): Verdict => {
  const problems: Problem[] = []
  for (const pkg of packages) {
    const first = pkg.hits[0]
    if (first === undefined) continue
    const evidence = `${first.path}:${first.line} (${first.token})`

    if (!runsVitest(pkg.testScript)) {
      problems.push({
        package: pkg.name,
        detail: pkg.testScript === undefined
          ? 'declares no `test` script in package.json'
          : `declares \`test\`: ${JSON.stringify(pkg.testScript)} — that script does not run vitest`,
        evidence,
      })
    }

    if (!pkg.vitestConfigs.some((config) => usesSharedDefineConfig(config.text))) {
      const found = pkg.vitestConfigs.map((config) => config.path)
      problems.push({
        package: pkg.name,
        detail: found.length === 0
          ? 'has no vitest.config.ts, vitest.config.mts, or vitest.config.js'
          : `vitest config ${found.join(', ')} does not import defineConfig from '${SHARED_CONFIG_PACKAGE}'`,
        evidence,
      })
    }
  }
  return { ok: problems.length === 0, problems }
}

export const formatDiagnostic = (problems: readonly Problem[], packages: readonly PackageEvidence[]): string => {
  const dirs = new Map(packages.map((pkg) => [pkg.name, pkg.dir]))
  const lines: string[] = []
  lines.push(`conformance enrollment: ${problems.length} problem(s) — R29 is not satisfied`)
  lines.push('')
  for (const problem of problems) {
    lines.push(
      `error[CONFORMANCE-ENROLLMENT]: ${problem.package} (${dirs.get(problem.package) ?? 'unknown'}) ${problem.detail}`,
    )
    lines.push(`  --> evidence: ${problem.evidence}`)
    lines.push(`  --> fix: ${ENROLLMENT_FIX}`)
  }
  lines.push('')
  lines.push('Coverage is judged inside every vitest run: `defineConfig` from @systemfsoftware/vitest-config adds a')
  lines.push('plugin that fails a run when a concurrency-primitive site in the package source never executed under a')
  lines.push('conformance check. A package that does not run vitest through that config is invisible to the plugin,')
  lines.push('so this guard checks enrollment only.')
  lines.push('')
  lines.push('remediation: add a `test` script that runs vitest to the package manifest, and a vitest.config.ts that')
  lines.push(`imports defineConfig from '${SHARED_CONFIG_PACKAGE}'.`)
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Filesystem
// ---------------------------------------------------------------------------

const walk = async (dir: string): Promise<readonly string[]> => {
  const found: string[] = []
  for await (const entry of Deno.readDir(dir)) {
    const path = join(dir, entry.name)
    if (entry.isDirectory) {
      if (IGNORED_DIR.test(entry.name)) continue
      found.push(...await walk(path))
    } else {
      found.push(path)
    }
  }
  return found
}

const workspaceDirs = async (root: string): Promise<readonly string[]> => {
  const wsPath = join(root, 'pnpm-workspace.yaml')
  let doc: unknown
  try {
    doc = parse(await Deno.readTextFile(wsPath))
  } catch (cause) {
    throw new Error(`${wsPath}: unparseable YAML — cannot name what the guard would miss`, { cause })
  }
  const declared = (doc as { packages?: unknown } | null)?.packages
  if (!Array.isArray(declared) || declared.length === 0) throw new Error(`${wsPath}: no \`packages:\` sequence`)

  const dirs = new Set<string>()
  for (const entry of declared) {
    if (typeof entry !== 'string' || !entry.endsWith('/*')) {
      throw new Error(`${wsPath}: only \`<dir>/*\` workspace globs are understood; got: ${String(entry)}`)
    }
    const prefix = join(root, entry.slice(0, -2))
    let children: AsyncIterable<Deno.DirEntry>
    try {
      children = Deno.readDir(prefix)
    } catch {
      continue
    }
    for await (const child of children) {
      if (!child.isDirectory) continue
      const dir = join(prefix, child.name)
      try {
        await Deno.stat(join(dir, 'package.json'))
      } catch {
        continue
      }
      dirs.add(dir)
    }
  }
  return [...dirs].sort()
}

type Manifest = { readonly name?: unknown; readonly scripts?: Record<string, unknown> }

const packageName = (manifest: Manifest, fallback: string): string => {
  const name = manifest.name
  return typeof name === 'string' && name.length > 0 ? name.replace(/^@[^/]+\//, '') : fallback
}

const testScriptOf = (manifest: Manifest): string | undefined => {
  const test = manifest.scripts?.['test']
  return typeof test === 'string' ? test : undefined
}

const collect = async (root: string): Promise<readonly PackageEvidence[]> => {
  const packages: PackageEvidence[] = []
  for (const dir of await workspaceDirs(root)) {
    const relDir = relative(root, dir).replace(/\\/g, '/')
    const manifest = JSON.parse(await Deno.readTextFile(join(dir, 'package.json'))) as Manifest
    const name = packageName(manifest, relDir)
    const files = (await walk(dir)).map((file) => relative(dir, file).replace(/\\/g, '/')).sort()

    const sources: SourceFile[] = []
    const vitestConfigs: SourceFile[] = []
    for (const file of files) {
      const repoPath = `${relDir}/${file}`
      if (VITEST_CONFIG_FILE.test(file)) {
        vitestConfigs.push({ path: repoPath, text: await Deno.readTextFile(join(dir, file)) })
      } else if (file.startsWith('src/') && isProductionSource(file)) {
        sources.push({ path: repoPath, text: await Deno.readTextFile(join(dir, file)) })
      }
    }

    packages.push({
      name,
      dir: relDir,
      testScript: testScriptOf(manifest),
      vitestConfigs,
      hits: detectPrimitives(sources),
    })
  }
  return packages
}

// ---------------------------------------------------------------------------
// Selftest
// ---------------------------------------------------------------------------

const selftest = (): number => {
  const hits = (path: string, text: string): readonly PrimitiveHit[] => detectPrimitives([{ path, text }])

  const pkg = (
    name: string,
    text: string,
    options: { readonly testScript?: string; readonly configs?: readonly SourceFile[] } = {},
  ): PackageEvidence => ({
    name,
    dir: `packages/${name}`,
    testScript: options.testScript,
    vitestConfigs: options.configs ?? [],
    hits: hits(`packages/${name}/src/index.ts`, text),
  })

  const config = (text: string): SourceFile => ({ path: `packages/x/vitest.config.ts`, text })

  const REFS = `import * as Ref from 'effect/Ref'
export const cell = Ref.make(0)
`
  const ENROLLED_CONFIG = `import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'
export default defineConfig({ ...sharedConfig })
`
  const RAW_CONFIG = `import { defineConfig } from 'vitest/config'
export default defineConfig({})
`

  const tests: { name: string; run: () => void }[] = [
    {
      name: 'fails for a primitive package with no vitest test script',
      run: () => {
        const verdict = evaluate([pkg('stateful', REFS, { configs: [config(ENROLLED_CONFIG)] })])
        if (verdict.ok) throw new Error('a primitive package with no test script must fail')
        const problem = verdict.problems.find((p) => p.detail.includes('no `test` script'))
        if (problem === undefined) {
          throw new Error(`expected a missing-test-script problem, got ${JSON.stringify(verdict.problems)}`)
        }
        if (problem.package !== 'stateful') throw new Error('the problem must name the package')
        if (!problem.evidence.includes('packages/stateful/src/index.ts:')) {
          throw new Error('the problem must carry path:line evidence')
        }
        if (!problem.evidence.includes('Ref.make')) throw new Error('the evidence must name the primitive token')
      },
    },
    {
      name: 'fails for a primitive package whose config imports defineConfig from vitest/config',
      run: () => {
        const verdict = evaluate([pkg('stateful', REFS, { testScript: 'vitest run', configs: [config(RAW_CONFIG)] })])
        if (verdict.ok) throw new Error("a config importing defineConfig from 'vitest/config' must fail")
        const problem = verdict.problems.find((p) => p.detail.includes('@systemfsoftware/vitest-config'))
        if (problem === undefined) {
          throw new Error(`expected a shared-config problem, got ${JSON.stringify(verdict.problems)}`)
        }
        if (problem.package !== 'stateful') throw new Error('the problem must name the package')
      },
    },
    {
      name: 'fails for a primitive package with no vitest config at all',
      run: () => {
        const verdict = evaluate([pkg('stateful', REFS, { testScript: 'vitest run' })])
        if (verdict.ok) throw new Error('a primitive package with no vitest config must fail')
        const problem = verdict.problems.find((p) => p.detail.includes('has no vitest.config'))
        if (problem === undefined) {
          throw new Error(`expected a missing-config problem, got ${JSON.stringify(verdict.problems)}`)
        }
      },
    },
    {
      name: 'passes for an enrolled package',
      run: () => {
        const verdict = evaluate([pkg('stateful', REFS, {
          testScript: 'vitest run --passWithNoTests',
          configs: [config(ENROLLED_CONFIG)],
        })])
        if (!verdict.ok) throw new Error(`expected ok, got ${JSON.stringify(verdict.problems)}`)
      },
    },
    {
      name: 'passes for a package with no primitive and no tests',
      run: () => {
        const verdict = evaluate([pkg('plain', `export const x = 1\n`)])
        if (!verdict.ok) throw new Error(`expected ok, got ${JSON.stringify(verdict.problems)}`)
      },
    },
    {
      name: 'reads vitest-script and shared-defineConfig enrollments from the surfaces they live on',
      run: () => {
        if (!runsVitest('vitest run --project conformance')) {
          throw new Error('`vitest run --project conformance` runs vitest')
        }
        if (runsVitest('jest')) throw new Error('a non-vitest test script is not enrolled')
        if (runsVitest(undefined)) throw new Error('a missing test script is not enrolled')
        const aliased = `import { defineConfig as defineVitestConfig } from '@systemfsoftware/vitest-config'
export default defineVitestConfig({})
`
        if (!usesSharedDefineConfig(aliased)) throw new Error('an aliased shared defineConfig import is enrolled')
        const sharedOnly = `import { sharedConfig } from '@systemfsoftware/vitest-config'
import { defineConfig } from 'vitest/config'
export default defineConfig({ ...sharedConfig })
`
        if (usesSharedDefineConfig(sharedOnly)) {
          throw new Error('importing only sharedConfig from the shared package is not enrollment')
        }
        if (!VITEST_CONFIG_FILE.test('vitest.config.ts')) throw new Error('vitest.config.ts is a vitest config')
        if (!VITEST_CONFIG_FILE.test('vitest.config.mts')) throw new Error('vitest.config.mts is a vitest config')
        if (!VITEST_CONFIG_FILE.test('vitest.config.js')) throw new Error('vitest.config.js is a vitest config')
        if (VITEST_CONFIG_FILE.test('vitest.node.config.js')) {
          throw new Error('a sibling node config is not the package vitest config')
        }
      },
    },
    {
      name: 'excludes test files, in-source test blocks, JSDoc fences, and type positions',
      run: () => {
        if (isProductionSource('src/index.test.ts')) throw new Error('a *.test.ts file is not production source')
        if (isProductionSource('tests/helpers.ts')) throw new Error('a tests/ file is not production source')
        if (!isProductionSource('src/index.ts')) throw new Error('src/index.ts is production source')

        const inSource = `import * as Ref from 'effect/Ref'
export const cell = Ref.make(0)
if (import.meta.vitest !== void 0) {
  const { Effect } = await import('effect')
  const forked = Effect.fork(Effect.void)
  void forked
}
`
        const inSourceHits = hits('packages/x/src/index.ts', inSource)
        if (!inSourceHits.some((h) => h.primitive === 'ref')) throw new Error('the production Ref use must be found')
        if (inSourceHits.some((h) => h.primitive === 'fork')) {
          throw new Error('the in-source test block must be excluded')
        }

        const fenced = `/**
 * \`\`\`ts import.meta.vitest
 * import * as Effect from 'effect/Effect'
 * Effect.fork(Effect.void)
 * \`\`\`
 */
export const x = 1
`
        if (hits('packages/x/src/index.ts', fenced).length !== 0) {
          throw new Error('a JSDoc code fence must not count as production use')
        }

        const typeOnly = `import * as Ref from 'effect/Ref'
export type Cell = Ref.Ref<number>
`
        if (hits('packages/x/src/index.ts', typeOnly).length !== 0) {
          throw new Error('a type position must not count as a value use')
        }
      },
    },
    {
      name: 'sees guard-local dynamic import bindings and every primitive form',
      run: () => {
        const dynamic = `const { Ref } = await import('effect')
export const cell = Ref.make(0)
const Queue = await import('effect/Queue')
export const q = Queue.unbounded()
`
        const found = hits('packages/x/src/index.ts', dynamic)
        if (!found.some((h) => h.primitive === 'ref')) throw new Error('a dynamic named binding must be seen')
        if (!found.some((h) => h.primitive === 'queue')) throw new Error('a dynamic namespace binding must be seen')

        const all = `import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import { Deferred, Semaphore } from 'effect'
export const a = Effect.acquireRelease(Effect.void, () => Effect.void)
export const b = Layer.scoped(Effect.void)
export const c = Deferred.make()
export const d = Semaphore.make(1)
`
        const primitives = primitivesOf(hits('packages/x/src/index.ts', all))
        for (const expected of ['scoped', 'deferred', 'semaphore']) {
          if (!primitives.includes(expected as Primitive)) {
            throw new Error(`expected ${expected}, got ${primitives.join(', ')}`)
          }
        }
      },
    },
  ]

  let failures = 0
  for (const t of tests) {
    try {
      t.run()
      console.log(`  ✓ ${t.name}`)
    } catch (err) {
      console.error(`  ✗ ${t.name}: ${err instanceof Error ? err.message : String(err)}`)
      failures++
    }
  }

  if (failures > 0) {
    console.error(`check-conformance-enrollment: selftest FAILED (${failures}/${tests.length})`)
    return 1
  }
  console.log(`check-conformance-enrollment: selftest ok (${tests.length} tests)`)
  return 0
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

const repoRoot = (): string => resolve(dirname(fromFileUrl(import.meta.url)), '..', '..')

const main = async (): Promise<number> => {
  if (Deno.args.includes('--selftest')) return selftest()

  const root = repoRoot()
  const packages = await collect(root)
  if (packages.length === 0) {
    throw new Error('no workspace package matched the workspace globs — refusing the empty verdict')
  }

  const matched = packages.filter((pkg) => pkg.hits.length > 0)
  if (matched.length === 0) {
    throw new Error('the R29 predicate matched no package — refusing the vacuous verdict')
  }

  const verdict = evaluate(packages)
  if (verdict.ok) {
    console.log(
      `conformance enrollment: ok — ${matched.length} package(s) own concurrent or stateful behaviour, every one runs vitest through defineConfig from ${SHARED_CONFIG_PACKAGE}`,
    )
    return 0
  }

  console.error(formatDiagnostic(verdict.problems, packages))
  return 1
}

if (import.meta.main) {
  try {
    Deno.exit(await main())
  } catch (err) {
    console.error(`check-conformance-enrollment: error: ${err instanceof Error ? err.message : String(err)}`)
    Deno.exit(1)
  }
}
