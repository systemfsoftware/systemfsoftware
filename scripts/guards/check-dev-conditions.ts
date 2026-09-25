#!/usr/bin/env -S deno run --allow-read --allow-write=/tmp --allow-env
// A workspace package is imported by its published name in tests, type-aware
// lint, tsc and Vitest. Under development that name must resolve to the
// package's own `src/` (skill: workspace-source-resolution), and only a
// published consumer may see `dist/`. Four tools have to agree for that to
// hold: the export map (tsdown), the config that owns each importer
// (tsconfig `customConditions`), the test runner (Vite's two condition keys),
// and api-extractor (which must NOT follow source).
//
// Each check below exists because its absence was observed: a source condition
// missing from `exports` sends every downloader of a tarball at `src/`; a
// `tests/` file outside `tsconfig.json#include` belongs to no configured
// program, so type-aware lint checks it with defaults that lack the condition
// and the published-name import becomes an error type the moment the
// dependency has no `dist/` (docs/solutions/build-errors/
// tests-outside-tsconfig-hide-workspace-source-errors.md).

import { dirname, join, relative } from '@std/path'
import { parse as parseYaml } from '@std/yaml'

/** The condition every tsdown-built workspace package exposes its source under. */
const CONDITION = '@systemfsoftware/source'

/** The shared Vitest config that sets both Vite condition pipelines. */
const SHARED_VITEST_CONFIG = '@systemfsoftware/vitest-config'

const REPO_ROOT = join(import.meta.dirname!, '..', '..')

/** Directories that never hold first-party sources. */
const SKIP_DIRS = new Set(['node_modules', 'dist', 'temp', 'coverage', 'reports', '.turbo', '.repo', '.git'])

type Json = Record<string, unknown>

/** `JSON.parse` that tolerates the line and block comments tsconfig files carry. */
const parseJsonc = (text: string): Json => {
  let out = ''
  let inString = false
  let inLine = false
  let inBlock = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!
    const next = text[i + 1]
    if (inLine) {
      if (char === '\n') {
        inLine = false
        out += char
      }
      continue
    }
    if (inBlock) {
      if (char === '*' && next === '/') {
        inBlock = false
        i++
      }
      continue
    }
    if (inString) {
      out += char
      if (char === '\\') {
        out += next ?? ''
        i++
      } else if (char === '"') inString = false
      continue
    }
    if (char === '"') {
      inString = true
      out += char
      continue
    }
    if (char === '/' && next === '/') {
      inLine = true
      i++
      continue
    }
    if (char === '/' && next === '*') {
      inBlock = true
      i++
      continue
    }
    out += char
  }
  return JSON.parse(out) as Json
}

const readJson = async (path: string): Promise<Json | undefined> => {
  try {
    return parseJsonc(await Deno.readTextFile(path))
  } catch {
    return undefined
  }
}

const exists = async (path: string): Promise<boolean> => {
  try {
    await Deno.stat(path)
    return true
  } catch {
    return false
  }
}

/** Expand one `pnpm-workspace.yaml` package glob (`packages/*`) into member directories. */
const expandGlob = async (root: string, pattern: string): Promise<string[]> => {
  const segments = pattern.split('/')
  let frontier = [root]
  for (const segment of segments) {
    const next: string[] = []
    for (const base of frontier) {
      if (segment !== '*') {
        next.push(join(base, segment))
        continue
      }
      for await (const entry of Deno.readDir(base)) {
        if (entry.isDirectory) next.push(join(base, entry.name))
      }
    }
    frontier = next
  }
  return frontier
}

type Member = {
  readonly name: string
  readonly dir: string
  readonly rel: string
  readonly manifest: Json
}

/** Every package the workspace declares, private ones included — the toolchain
 *  packages are importers of nothing but are their own class (internals). */
const workspaceMembers = async (): Promise<Member[]> => {
  const workspace = parseYaml(await Deno.readTextFile(join(REPO_ROOT, 'pnpm-workspace.yaml'))) as {
    packages?: readonly string[]
  }
  const dirs = new Set<string>()
  for (const pattern of workspace.packages ?? []) {
    for (const dir of await expandGlob(REPO_ROOT, pattern)) {
      if (await exists(join(dir, 'package.json'))) dirs.add(dir)
    }
  }
  const members: Member[] = []
  for (const dir of [...dirs].sort()) {
    const manifest = await readJson(join(dir, 'package.json'))
    if (manifest === undefined || typeof manifest.name !== 'string') continue
    members.push({ name: manifest.name, dir, rel: relative(REPO_ROOT, dir), manifest })
  }
  return members
}

const walk = async (dir: string, acc: string[] = []): Promise<string[]> => {
  for await (const entry of Deno.readDir(dir)) {
    const path = join(dir, entry.name)
    if (entry.isDirectory) {
      if (SKIP_DIRS.has(entry.name)) continue
      await walk(path, acc)
    } else if (/\.(?:ts|tsx|mts|cts)$/.test(entry.name)) {
      acc.push(path)
    }
  }
  return acc
}

/** A `tsconfig` `include` entry covers a file: exact path, directory prefix, or glob. */
const includeCovers = (include: readonly string[], file: string): boolean => {
  const escape = (text: string) => text.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  for (const pattern of include) {
    if (pattern === file) return true
    if (!pattern.includes('*')) {
      if (file.startsWith(`${pattern}/`)) return true
      continue
    }
    const source = pattern.split('**').map((part) => part.split('*').map(escape).join('[^/]*')).join('.*')
    if (new RegExp(`^${source}$`).test(file)) return true
  }
  return false
}

/** The first `node_modules/<name>` on the walk up from `fromDir` (pnpm links per package). */
const resolvePackageDir = async (fromDir: string, name: string): Promise<string | undefined> => {
  let dir = fromDir
  while (true) {
    const candidate = join(dir, 'node_modules', name)
    if (await exists(candidate)) return candidate
    const parent = dirname(dir)
    if (parent === dir || !parent.startsWith(REPO_ROOT)) return undefined
    dir = parent
  }
}

/** Resolve a tsconfig `extends` specifier to a file path. */
const resolveConfig = async (fromDir: string, specifier: string): Promise<string | undefined> => {
  if (specifier.startsWith('.')) {
    const base = join(fromDir, specifier)
    for (const candidate of [base, `${base}.json`, join(base, 'tsconfig.json')]) {
      if (await exists(candidate)) return candidate
    }
    return undefined
  }
  const parts = specifier.split('/')
  const size = specifier.startsWith('@') ? 2 : 1
  const packageName = parts.slice(0, size).join('/')
  const subpath = parts.slice(size).join('/')
  const packageDir = await resolvePackageDir(fromDir, packageName)
  if (packageDir === undefined) return undefined
  const manifest = await readJson(join(packageDir, 'package.json'))
  if (manifest === undefined) return undefined
  const entry = (manifest['exports'] as Json | undefined)?.[subpath === '' ? '.' : `./${subpath}`]
  const target = typeof entry === 'string'
    ? entry
    : subpath === ''
    ? (manifest['main'] as string | undefined)
    : undefined
  const resolved = target === undefined ? join(packageDir, subpath) : join(packageDir, target)
  for (const candidate of [resolved, `${resolved}.json`, join(resolved, 'tsconfig.json')]) {
    if (await exists(candidate)) return candidate
  }
  return undefined
}

/** `compilerOptions` of a config merged with everything it extends. */
const compilerOptionsOf = async (configPath: string): Promise<Json> => {
  const config = await readJson(configPath)
  if (config === undefined) return {}
  const own = (config['compilerOptions'] ?? {}) as Json
  const extendsValue = config['extends']
  const specifiers = Array.isArray(extendsValue)
    ? extendsValue.map(String)
    : typeof extendsValue === 'string'
    ? [extendsValue]
    : []
  let merged: Json = {}
  for (const specifier of specifiers) {
    const resolved = await resolveConfig(dirname(configPath), specifier)
    if (resolved === undefined) continue
    merged = { ...merged, ...(await compilerOptionsOf(resolved)) }
  }
  return { ...merged, ...own }
}

/** NodeNext / Node16 / Bundler / Preserve resolve an export condition; node10 does not. */
const honoursConditions = (options: Json): boolean => {
  const module = String(options['module'] ?? '').toLowerCase()
  const resolution = String(options['moduleResolution'] ?? '').toLowerCase()
  return ['nodenext', 'node16', 'preserve'].includes(module) ||
    ['bundler', 'node16', 'nodenext'].includes(resolution)
}

/** Named *and* reachable: a condition in a node10-style project is inert (G4). */
const resolvesToSource = (options: Json): boolean =>
  Array.isArray(options['customConditions']) &&
  (options['customConditions'] as unknown[]).includes(CONDITION) &&
  honoursConditions(options)

/**
 * Every project config in a member: any `tsconfig*.json` beside the manifest,
 * plus anything `tsconfig.json` reaches through `references`. The tools pick
 * differently — `tsc -b` follows references, tsgolint and tstyche take the
 * config that includes the file — so the check asks whether *some* project
 * covers a file and names the condition, never which one a tool picked.
 */
const projectConfigs = async (dir: string): Promise<string[]> => {
  const paths = new Set<string>()
  for await (const entry of Deno.readDir(dir)) {
    if (entry.isFile && /^tsconfig(\..+)?\.json$/.test(entry.name)) paths.add(join(dir, entry.name))
  }
  const root = join(dir, 'tsconfig.json')
  const config = await readJson(root)
  const references = config?.['references']
  if (Array.isArray(references)) {
    for (const reference of references) {
      const path = (reference as Json | undefined)?.['path']
      if (typeof path !== 'string') continue
      const resolved = await resolveConfig(dir, path)
      if (resolved !== undefined) paths.add(resolved)
    }
  }
  return [...paths]
}

type Failure = string

/** The static wiring of one member: export map, tsconfig condition, Vitest keys, extractor. */
const wiringFailures = async (member: Member): Promise<Failure[]> => {
  const failures: Failure[] = []
  const manifest = member.manifest
  const tsdownConfig = await exists(join(member.dir, 'tsdown.config.ts'))

  // The export map is generated; what it must contain is the condition first,
  // then `types`, then `default` — a condition after `default` is unreachable.
  if (tsdownConfig) {
    const exports = (manifest['exports'] ?? {}) as Json
    const objectSubpaths = Object.entries(exports)
      .filter(([key, entry]) => key !== './package.json' && typeof entry === 'object' && entry !== null)
    for (const [subpath, entry] of objectSubpaths) {
      const record = entry as Json
      const keys = Object.keys(record)
      if (keys[0] !== CONDITION) failures.push(`exports["${subpath}"] first key is ${keys[0] ?? '(none)'}`)
      if (typeof record['types'] !== 'string' || !record['types'].includes('/dist/')) {
        failures.push(`exports["${subpath}"] has no dist types`)
      }
      if (!(keys.indexOf('types') !== -1 && keys.indexOf('types') < keys.indexOf('default'))) {
        failures.push(`exports["${subpath}"] orders types after default`)
      }
    }

    // The published map must not carry the workspace condition, and every entry
    // must be the object `injectTypes` produced — a bare string is the untyped
    // resolution a tarball consumer would get.
    const publishExports = (manifest['publishConfig'] as Json | undefined)?.['exports'] as Json | undefined
    if (publishExports === undefined) {
      failures.push('publishConfig.exports is missing')
    } else {
      for (const [subpath, entry] of Object.entries(publishExports)) {
        if (subpath === './package.json') continue
        if (typeof entry === 'string') {
          failures.push(`publishConfig.exports["${subpath}"] is a bare string`)
          continue
        }
        if (typeof entry !== 'object' || entry === null) continue
        const record = entry as Json
        if (Object.keys(record).includes(CONDITION)) {
          failures.push(`publishConfig.exports["${subpath}"] leaks the condition`)
        }
        if (typeof record['types'] !== 'string') {
          failures.push(`publishConfig.exports["${subpath}"] has no types`)
        }
      }
    }
  }

  // Vite replaces its default conditions when they are set, and the node
  // environment resolves through the SSR pipeline — a config that sets one key
  // alone leaves half the suites on `dist/`.
  for (const name of ['vitest.config.ts', 'vitest.config.mts', 'vitest.contract.config.ts']) {
    const path = join(member.dir, name)
    if (!(await exists(path))) continue
    const text = await Deno.readTextFile(path)
    if (text.includes(SHARED_VITEST_CONFIG)) continue
    const resolveWired = /resolve\s*:\s*\{[\s\S]*?conditions/.test(text) && text.includes(CONDITION)
    const ssrWired = /ssr\s*:\s*\{[\s\S]*?resolve\s*:\s*\{[\s\S]*?conditions/.test(text) && text.includes(CONDITION)
    if (!(resolveWired && ssrWired)) failures.push(`${name} does not wire both Vite condition keys`)
  }

  // api-extractor resolves through its own tsconfig; once that file names the
  // condition it follows a sibling's `src/*.ts` and reports
  // `ae-wrong-input-file-type`, so it points at a config that clears it.
  const extractor = await readJson(join(member.dir, 'api-extractor.json'))
  if (extractor !== undefined) {
    const compiler = (extractor['compiler'] ?? {}) as Json
    if (
      typeof compiler['tsconfigFilePath'] !== 'string' || !compiler['tsconfigFilePath'].includes('tsconfig.api.json')
    ) {
      failures.push('api-extractor.json does not point at tsconfig.api.json')
    }
    const apiOptions = await compilerOptionsOf(join(member.dir, 'tsconfig.api.json'))
    if (!Array.isArray(apiOptions['customConditions']) || (apiOptions['customConditions'] as unknown[]).length !== 0) {
      failures.push('tsconfig.api.json does not clear customConditions')
    }
  }

  return failures
}

/** Files Node loads without a condition: they resolve `dist/` by design. */
const isRuntimeConfig = (rel: string): boolean =>
  /(?:^|\/)(?:[^/]*\.config|vitest-setup|vitest\.setup)\.(?:ts|mts|cts)$/.test(rel) ||
  /(?:^|\/)stryker\.config\./.test(rel) ||
  rel.startsWith('.storybook/')

/**
 * Every first-party file that imports a workspace package by its published name
 * must belong to a project that names the condition. A file outside every
 * `include` is in no program: `tsc` never reads it and type-aware lint checks
 * it with defaults, so the import degrades to an error type as soon as the
 * dependency's `dist/` is absent — which is every clean checkout.
 */
const importerFailures = async (member: Member, byName: ReadonlyMap<string, Member>): Promise<Failure[]> => {
  const failures: Failure[] = []
  const configs = await projectConfigs(member.dir)
  if (configs.length === 0) return failures
  const covers = await Promise.all(configs.map(async (configPath) => ({
    label: relative(member.dir, configPath),
    include: (await readJson(configPath))?.['include'],
    options: await compilerOptionsOf(configPath),
  })))

  for (const file of await walk(member.dir)) {
    const rel = relative(member.dir, file)
    if (isRuntimeConfig(rel)) continue
    const text = await Deno.readTextFile(file)
    const imported = new Set<string>()
    for (const match of text.matchAll(/(?:from\s*|import\s*\(\s*)['"](@[a-z0-9-]+\/[a-z0-9-]+)(?:\/[^'"]*)?['"]/g)) {
      if (byName.has(match[1]!)) imported.add(match[1]!)
    }
    if (imported.size === 0) continue
    const covering = covers.filter((config) =>
      Array.isArray(config.include) && includeCovers(config.include as string[], rel)
    )
    if (covering.length === 0) {
      failures.push(
        `${rel} imports ${[...imported].sort().join(', ')} but no tsconfig include names it — it is in no program`,
      )
      continue
    }
    if (!covering.some((config) => resolvesToSource(config.options))) {
      failures.push(
        `${rel} is covered only by ${
          covering.map((config) => config.label).join(', ')
        }, none of which resolves ${CONDITION}`,
      )
    }
  }
  return failures
}

const workspaceFailures = async (): Promise<Failure[]> => {
  const members = await workspaceMembers()
  const byName = new Map(members.map((member) => [member.name, member]))
  const failures: Failure[] = []
  const vitest = await Deno.readTextFile(join(REPO_ROOT, 'packages/toolchain/vitest-config/lib/base.js'))
  if (!vitest.includes(CONDITION)) failures.push(`${SHARED_VITEST_CONFIG}: does not name the source condition`)
  if (!/resolve\s*:\s*\{\s*conditions/.test(vitest)) {
    failures.push(`${SHARED_VITEST_CONFIG}: does not set resolve.conditions`)
  }
  if (!/ssr\s*:\s*\{\s*resolve\s*:\s*\{\s*conditions/.test(vitest)) {
    failures.push(`${SHARED_VITEST_CONFIG}: does not set ssr.resolve.conditions`)
  }
  for (const member of members) {
    for (const failure of await wiringFailures(member)) failures.push(`${member.name}: ${failure}`)
    for (const failure of await importerFailures(member, byName)) failures.push(`${member.name}: ${failure}`)
  }
  return failures
}

const selftest = async (): Promise<Failure[]> => {
  const failed: Failure[] = []
  const dir = await Deno.makeTempDir()
  try {
    await Deno.writeTextFile(
      join(dir, 'package.json'),
      JSON.stringify({
        name: '@systemfsoftware/broken',
        exports: { '.': { types: './dist/index.d.ts', default: './dist/index.mjs' } },
        publishConfig: { exports: { '.': { types: './dist/index.d.ts', default: './dist/index.mjs' } } },
      }),
    )
    await Deno.writeTextFile(join(dir, 'tsdown.config.ts'), 'export default {}\n')
    await Deno.writeTextFile(
      join(dir, 'tsconfig.json'),
      JSON.stringify({ compilerOptions: { module: 'NodeNext' }, include: ['src'] }),
    )
    const manifest = (await readJson(join(dir, 'package.json')))!
    if ((await wiringFailures({ name: '@systemfsoftware/broken', dir, rel: dir, manifest })).length === 0) {
      failed.push('a package missing the source condition was not reported')
    }

    await Deno.writeTextFile(
      join(dir, 'tsconfig.json'),
      JSON.stringify({ compilerOptions: { module: 'NodeNext', customConditions: [CONDITION] }, include: ['src'] }),
    )
    await Deno.mkdir(join(dir, 'tests'))
    await Deno.writeTextFile(join(dir, 'tests', 'a.test.ts'), "import { dep } from '@systemfsoftware/dep'\n")
    const dep: Member = { name: '@systemfsoftware/dep', dir, rel: dir, manifest: { name: '@systemfsoftware/dep' } }
    const outside = await importerFailures(
      { name: '@systemfsoftware/broken', dir, rel: dir, manifest: { name: '@systemfsoftware/broken' } },
      new Map([[dep.name, dep]]),
    )
    if (outside.length !== 1) failed.push(`a test file outside every include gave ${outside.length} failures, not 1`)
  } finally {
    await Deno.remove(dir, { recursive: true })
  }
  return failed
}

if (import.meta.main) {
  const failures = Deno.args.includes('--selftest') ? await selftest() : await workspaceFailures()
  for (const failure of failures) console.error(failure)
  Deno.exit(failures.length === 0 ? 0 : 1)
}
