#!/usr/bin/env -S deno run --allow-read
/**
 * Guard: every package whose PRODUCTION source forks fibers, holds
 * `Queue`/`Deferred`/`Ref`/`Semaphore` state, or acquires scoped resources is
 * inventoried in `scripts/guards/conformance-inventory.json`, and each
 * inventoried package adopts the conformance check that fits it (R29/KTD13).
 *
 * The R29 set is derived from source, never from a hand-kept list: only a
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
 * The guard fails when:
 *   1. a matched package is missing from the inventory;
 *   2. an inventoried package declares fewer primitives than its source uses;
 *   3. an inventoried package has no `*.conformance.test.ts` anywhere in the
 *      package, unless its entry is a smoke journey (`journey` names the file)
 *      or a harness entry (`harness.selfSuites` names the suites that exercise
 *      it);
 *   4. a named journey or harness self-suite does not exist;
 *   5. the inventory itself is malformed (unknown check, duplicate entry,
 *      entry for a package the workspace does not have).
 *
 * Harness rule: a package that IS conformance or test infrastructure cannot
 * adopt a check the way a consumer can. Its entry is still not silently
 * excluded: it names the check its own primitives implement and lists
 * `harness.selfSuites` — the package's own suites that exercise it — with a
 * `why` reason. The guard verifies those suites exist.
 *
 * Usage:
 *   deno run --allow-read scripts/guards/check-conformance-inventory.ts
 *   deno run --allow-read scripts/guards/check-conformance-inventory.ts --selftest
 */
import { dirname, fromFileUrl, join, relative, resolve } from '@std/path'
import { parse } from '@std/yaml'

export type Primitive = 'fork' | 'queue' | 'deferred' | 'ref' | 'semaphore' | 'scoped'
export type Check = 'linearizable' | 'sequential' | 'released' | 'smoke-journey'

export const PRIMITIVES: readonly Primitive[] = ['fork', 'queue', 'deferred', 'ref', 'semaphore', 'scoped']
export const CHECKS: readonly Check[] = ['linearizable', 'sequential', 'released', 'smoke-journey']

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
  /** Package-relative POSIX paths of every file in the package. */
  readonly files: readonly string[]
  readonly hits: readonly PrimitiveHit[]
}

export type InventoryEntry = {
  readonly name: string
  readonly primitives: readonly Primitive[]
  readonly checks: readonly Check[]
  readonly journey?: string
  readonly harness?: { readonly why: string; readonly selfSuites: readonly string[] }
}

export type Inventory = { readonly entries: readonly InventoryEntry[] }

export type ProblemKind =
  | 'missing-inventory'
  | 'missing-primitive'
  | 'missing-check'
  | 'missing-file'
  | 'invalid-inventory'

export type Problem = {
  readonly kind: ProblemKind
  readonly package: string
  readonly detail: string
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

const isPrimitive = (value: unknown): value is Primitive => PRIMITIVES.includes(value as Primitive)
const isCheck = (value: unknown): value is Check => CHECKS.includes(value as Check)
const normalizePath = (path: string): string => path.replace(/\\/g, '/').replace(/^\.\//, '')

const resolveRelative = (path: string): string => {
  const parts = path.split('/')
  const stack: string[] = []
  for (const part of parts) {
    if (part === '' || part === '.') continue
    if (part === '..') {
      if (stack.length === 0) return path
      stack.pop()
      continue
    }
    stack.push(part)
  }
  return stack.join('/')
}

export const parseInventory = (text: string): Inventory => {
  let doc: unknown
  try {
    doc = JSON.parse(text)
  } catch (cause) {
    throw new Error(
      `conformance-inventory.json is not valid JSON: ${cause instanceof Error ? cause.message : String(cause)}`,
    )
  }
  const entries = (doc as { entries?: unknown } | null)?.entries
  if (!Array.isArray(entries)) throw new Error('conformance-inventory.json: `entries` must be an array')
  return { entries: entries as readonly InventoryEntry[] }
}

const evidenceDetail = (pkg: PackageEvidence): string => {
  const lines: string[] = []
  for (const primitive of primitivesOf(pkg.hits)) {
    const shown = pkg.hits.filter((hit) => hit.primitive === primitive).slice(0, 3)
    for (const hit of shown) lines.push(`${primitive}: ${hit.path}:${hit.line} (${hit.token})`)
  }
  return lines.join('\n')
}

export const evaluate = (packages: readonly PackageEvidence[], inventory: Inventory): Verdict => {
  const problems: Problem[] = []
  const byName = new Map<string, PackageEvidence>()
  const rootFiles = new Set<string>()
  for (const pkg of packages) {
    byName.set(pkg.name, pkg)
    for (const file of pkg.files) rootFiles.add(`${pkg.dir}/${normalizePath(file)}`)
  }
  const entries = new Map<string, InventoryEntry>()
  for (const raw of inventory.entries) {
    if (typeof raw !== 'object' || raw === null) {
      problems.push({
        kind: 'invalid-inventory',
        package: '(missing name)',
        detail: `entry is not an object: ${String(raw)}`,
      })
      continue
    }
    const entry = raw
    const name = typeof entry.name === 'string' ? entry.name : String(entry.name)
    if (entries.has(name)) {
      problems.push({ kind: 'invalid-inventory', package: name, detail: 'duplicate inventory entry' })
    }
    entries.set(name, entry)

    if (!Array.isArray(entry.primitives) || entry.primitives.length === 0) {
      problems.push({ kind: 'invalid-inventory', package: name, detail: 'names no primitive' })
    } else {
      for (const primitive of entry.primitives) {
        if (!isPrimitive(primitive)) {
          problems.push({
            kind: 'invalid-inventory',
            package: name,
            detail: `unknown primitive '${String(primitive)}'`,
          })
        }
      }
    }

    if (!Array.isArray(entry.checks) || entry.checks.length === 0) {
      problems.push({ kind: 'invalid-inventory', package: name, detail: 'names no check' })
    } else {
      for (const check of entry.checks) {
        if (!isCheck(check)) {
          problems.push({ kind: 'invalid-inventory', package: name, detail: `unknown check '${String(check)}'` })
        }
      }
      if (entry.checks.includes('smoke-journey') && entry.journey === undefined) {
        problems.push({ kind: 'invalid-inventory', package: name, detail: "names smoke-journey but no 'journey' path" })
      }
    }

    if (entry.harness !== undefined) {
      const why = typeof entry.harness.why === 'string' ? entry.harness.why.trim() : ''
      const suites = Array.isArray(entry.harness.selfSuites) ? entry.harness.selfSuites : []
      if (why.length === 0 || suites.length === 0) {
        problems.push({
          kind: 'invalid-inventory',
          package: name,
          detail: "harness entry needs a non-empty 'why' and 'selfSuites'",
        })
      }
    }
  }

  for (const pkg of packages) {
    if (pkg.hits.length === 0) continue
    const entry = entries.get(pkg.name)
    if (entry === undefined) {
      problems.push({ kind: 'missing-inventory', package: pkg.name, detail: evidenceDetail(pkg) })
      continue
    }
    const declared = Array.isArray(entry.primitives) ? entry.primitives : []
    const undeclared = primitivesOf(pkg.hits).filter((primitive) => !declared.includes(primitive))
    if (undeclared.length > 0) {
      problems.push({
        kind: 'missing-primitive',
        package: pkg.name,
        detail: `source uses ${undeclared.join(', ')} but the entry declares ${declared.join(', ') || 'nothing'}`,
      })
    }
  }

  for (const entry of inventory.entries) {
    const name = typeof entry.name === 'string' ? entry.name : String(entry.name)
    const pkg = byName.get(name)
    if (pkg === undefined) {
      problems.push({
        kind: 'invalid-inventory',
        package: name,
        detail: 'names a package that is not a workspace package',
      })
      continue
    }

    const checks = Array.isArray(entry.checks) ? entry.checks : []
    const inPackage = new Set(pkg.files.map(normalizePath))

    if (checks.includes('smoke-journey')) {
      if (entry.journey === undefined) continue
      if (!inPackage.has(normalizePath(entry.journey))) {
        problems.push({
          kind: 'missing-file',
          package: name,
          detail: `smoke journey '${entry.journey}' does not exist in ${pkg.dir}`,
        })
      }
      continue
    }

    if (entry.harness !== undefined) {
      const suites = Array.isArray(entry.harness.selfSuites) ? entry.harness.selfSuites : []
      const absolute = suites.map((suite) => resolveRelative(`${pkg.dir}/${normalizePath(suite)}`))
      const absent = suites.filter((_, i) => !rootFiles.has(absolute[i] as string))
      if (absent.length > 0) {
        problems.push({
          kind: 'missing-file',
          package: name,
          detail: `harness self-suite(s) missing: ${absent.join(', ')}`,
        })
      }
      continue
    }

    if (!pkg.files.some((file) => file.endsWith('.conformance.test.ts'))) {
      problems.push({
        kind: 'missing-check',
        package: name,
        detail: `no *.conformance.test.ts anywhere in ${pkg.dir} and no smoke journey`,
      })
    }
  }

  return { ok: problems.length === 0, problems }
}

export const formatDiagnostic = (problems: readonly Problem[], packages: readonly PackageEvidence[]): string => {
  const dirs = new Map(packages.map((pkg) => [pkg.name, pkg.dir]))
  const lines: string[] = []
  const header: Record<string, string> = {
    'missing-inventory': 'owns concurrent or stateful behaviour but is missing from the inventory',
    'missing-primitive': 'is inventoried but the entry under-declares its primitives',
    'missing-check': 'is inventoried but has no conformance test',
    'missing-file': 'names a file that does not exist',
    'invalid-inventory': 'has a malformed inventory entry',
  }
  lines.push(`conformance inventory: ${problems.length} problem(s) — R29 is not satisfied`)
  lines.push('')
  for (const problem of problems) {
    lines.push(
      `error[CONFORMANCE-INVENTORY]: ${problem.package} (${dirs.get(problem.package) ?? 'unknown'}) ${
        header[problem.kind]
      }`,
    )
    for (const detail of problem.detail.split('\n')) lines.push(`  --> ${detail}`)
  }
  lines.push('')
  lines.push('Every package whose production source forks fibers, holds `Queue`, `Deferred`, `Ref`, or `Semaphore`')
  lines.push('state, or acquires scoped resources is inventoried in scripts/guards/conformance-inventory.json, and')
  lines.push('each inventoried package adopts the check that fits it (R29). The set is derived from source, so the')
  lines.push('inventory is the only place to satisfy this guard.')
  lines.push('')
  lines.push('remediation:')
  lines.push('  1. Add the named package to scripts/guards/conformance-inventory.json with every primitive the')
  lines.push('     evidence shows and the check that fits it (linearizable | sequential | released | smoke-journey).')
  lines.push('  2. Add the *.conformance.test.ts the entry adopts, or a smoke-journey `journey` path, or — only for')
  lines.push('     the conformance/test infrastructure itself — a `harness` entry naming the suites that exercise it.')
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

const packageName = (manifest: string, fallback: string): string => {
  const name = (JSON.parse(manifest) as { name?: unknown }).name
  return typeof name === 'string' && name.length > 0 ? name.replace(/^@[^/]+\//, '') : fallback
}

const collect = async (root: string): Promise<readonly PackageEvidence[]> => {
  const packages: PackageEvidence[] = []
  for (const dir of await workspaceDirs(root)) {
    const relDir = relative(root, dir).replace(/\\/g, '/')
    const name = packageName(await Deno.readTextFile(join(dir, 'package.json')), relDir)
    const files = (await walk(dir)).map((file) => relative(dir, file).replace(/\\/g, '/')).sort()
    const sources: SourceFile[] = []
    for (const file of files) {
      if (!file.startsWith('src/') || !isProductionSource(file)) continue
      sources.push({ path: `${relDir}/${file}`, text: await Deno.readTextFile(join(dir, file)) })
    }
    packages.push({ name, dir: relDir, files, hits: detectPrimitives(sources) })
  }
  return packages
}

// ---------------------------------------------------------------------------
// Selftest
// ---------------------------------------------------------------------------

const selftest = (): number => {
  const hits = (path: string, text: string): readonly PrimitiveHit[] => detectPrimitives([{ path, text }])

  const pkg = (name: string, text: string, extraFiles: readonly string[] = []): PackageEvidence => ({
    name,
    dir: `packages/${name}`,
    files: ['src/index.ts', ...extraFiles],
    hits: hits(`packages/${name}/src/index.ts`, text),
  })

  const inventory = (entries: readonly unknown[]): Inventory => ({ entries: entries as readonly InventoryEntry[] })

  const FORKS = `import * as Effect from 'effect/Effect'
export const go = Effect.fork(Effect.void)
`
  const REFS = `import * as Ref from 'effect/Ref'
export const cell = Ref.make(0)
`

  const tests: { name: string; run: () => void }[] = [
    {
      name: 'fails for a package that forks fibers and is missing from the inventory',
      run: () => {
        const verdict = evaluate([pkg('forks', FORKS)], inventory([]))
        if (verdict.ok) throw new Error('a forking package absent from the inventory must fail')
        const problem = verdict.problems.find((p) => p.kind === 'missing-inventory')
        if (problem === undefined) {
          throw new Error(`expected missing-inventory, got ${JSON.stringify(verdict.problems)}`)
        }
        if (problem.package !== 'forks') throw new Error('the problem must name the package')
        if (!problem.detail.includes('fork:')) throw new Error('the problem must name the primitive found')
        if (!problem.detail.includes('packages/forks/src/index.ts:')) {
          throw new Error('the problem must carry file:line evidence')
        }
      },
    },
    {
      name: 'fails for an inventoried package with no .conformance.test.ts and no smoke-journey entry',
      run: () => {
        const verdict = evaluate(
          [pkg('stateful', REFS)],
          inventory([{ name: 'stateful', primitives: ['ref'], checks: ['sequential'] }]),
        )
        if (verdict.ok) throw new Error('an inventoried package with no conformance test must fail')
        const problem = verdict.problems.find((p) => p.kind === 'missing-check')
        if (problem === undefined) throw new Error(`expected missing-check, got ${JSON.stringify(verdict.problems)}`)
        if (!problem.detail.includes('.conformance.test.ts')) {
          throw new Error('the problem must name the missing suffix')
        }
      },
    },
    {
      name: 'passes when a matched package is inventoried and holds a .conformance.test.ts',
      run: () => {
        const verdict = evaluate(
          [pkg('stateful', REFS, ['tests/stateful.conformance.test.ts'])],
          inventory([{ name: 'stateful', primitives: ['ref'], checks: ['sequential'] }]),
        )
        if (!verdict.ok) throw new Error(`expected ok, got ${JSON.stringify(verdict.problems)}`)
      },
    },
    {
      name: 'fails when an inventoried package under-declares its primitives',
      run: () => {
        const verdict = evaluate(
          [pkg('stateful', REFS, ['tests/stateful.conformance.test.ts'])],
          inventory([{ name: 'stateful', primitives: ['fork'], checks: ['sequential'] }]),
        )
        if (verdict.ok) throw new Error('an undeclared primitive must fail')
        const problem = verdict.problems.find((p) => p.kind === 'missing-primitive')
        if (problem === undefined || !problem.detail.includes('ref')) {
          throw new Error(`expected missing-primitive naming ref, got ${JSON.stringify(verdict.problems)}`)
        }
      },
    },
    {
      name: 'fails when a smoke-journey entry names a journey that does not exist',
      run: () => {
        const verdict = evaluate(
          [pkg('journey', REFS)],
          inventory([{ name: 'journey', primitives: ['ref'], checks: ['smoke-journey'], journey: 'examples/boot.ts' }]),
        )
        if (verdict.ok) throw new Error('a missing journey file must fail')
        const problem = verdict.problems.find((p) => p.kind === 'missing-file')
        if (problem === undefined || !problem.detail.includes('examples/boot.ts')) {
          throw new Error(`expected missing-file naming the journey, got ${JSON.stringify(verdict.problems)}`)
        }
      },
    },
    {
      name: 'passes when a smoke-journey entry names an existing journey',
      run: () => {
        const verdict = evaluate(
          [pkg('journey', REFS, ['examples/boot.ts'])],
          inventory([{ name: 'journey', primitives: ['ref'], checks: ['smoke-journey'], journey: 'examples/boot.ts' }]),
        )
        if (!verdict.ok) throw new Error(`expected ok, got ${JSON.stringify(verdict.problems)}`)
      },
    },
    {
      name: 'passes when a harness entry names an existing self-suite, and fails when it does not',
      run: () => {
        const entry = {
          name: 'harness',
          primitives: ['ref'],
          checks: ['released'],
          harness: { why: 'it is the check', selfSuites: ['tests/self.integration.test.ts'] },
        }
        const green = evaluate([pkg('harness', REFS, ['tests/self.integration.test.ts'])], inventory([entry]))
        if (!green.ok) throw new Error(`expected ok, got ${JSON.stringify(green.problems)}`)
        const red = evaluate([pkg('harness', REFS)], inventory([entry]))
        if (red.ok) throw new Error('a missing harness self-suite must fail')
      },
    },
    {
      name: 'rejects an inventory entry naming an unknown check or a package that is not in the workspace',
      run: () => {
        const unknown = evaluate(
          [pkg('stateful', REFS, ['tests/stateful.conformance.test.ts'])],
          inventory([{ name: 'stateful', primitives: ['ref'], checks: ['vibes'] }]),
        )
        if (!unknown.problems.some((p) => p.kind === 'invalid-inventory' && p.detail.includes('vibes'))) {
          throw new Error('an unknown check must be rejected')
        }
        const ghost = evaluate(
          [pkg('stateful', REFS, ['tests/stateful.conformance.test.ts'])],
          inventory([
            { name: 'stateful', primitives: ['ref'], checks: ['sequential'] },
            { name: 'ghost', primitives: ['ref'], checks: ['sequential'] },
          ]),
        )
        if (!ghost.problems.some((p) => p.kind === 'invalid-inventory' && p.package === 'ghost')) {
          throw new Error('an entry for a non-workspace package must be rejected')
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
    console.error(`check-conformance-inventory: selftest FAILED (${failures}/${tests.length})`)
    return 1
  }
  console.log(`check-conformance-inventory: selftest ok (${tests.length} tests)`)
  return 0
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

const repoRoot = (): string => resolve(dirname(fromFileUrl(import.meta.url)), '..', '..')

const main = async (): Promise<number> => {
  if (Deno.args.includes('--selftest')) return selftest()

  const root = repoRoot()
  const inventory = parseInventory(await Deno.readTextFile(join(root, 'scripts/guards/conformance-inventory.json')))
  const packages = await collect(root)
  if (packages.length === 0) {
    throw new Error('no workspace package matched the workspace globs — refusing the empty verdict')
  }

  const matched = packages.filter((pkg) => pkg.hits.length > 0)
  if (matched.length === 0) {
    throw new Error('the R29 predicate matched no package — refusing the vacuous verdict')
  }

  const verdict = evaluate(packages, inventory)
  if (verdict.ok) {
    console.log(
      `conformance inventory: ok — ${matched.length} package(s) own concurrent or stateful behaviour, every one inventoried with the check that fits it`,
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
    console.error(`check-conformance-inventory: error: ${err instanceof Error ? err.message : String(err)}`)
    Deno.exit(1)
  }
}
