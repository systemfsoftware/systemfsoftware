// The gates of the composition pack (compound-packs/composition): how the
// units of a workspace compose. Every check reads the pnpm workspace under
// `root`, its package.json files and its ts/tsx/mts sources, and returns a
// Verdict. composition-granularity reports until it is run with --strict.
//
// Imports are found by pattern over source text (static, dynamic and
// re-export specifiers), not by compiling, so a check never needs an install.
// A "test file" is one named *.test.* / *.spec.* or under a tests, test,
// __tests__ or e2e folder; "source" below means the non-test files.
import { dirname, join, relative, resolve } from '@std/path'
import { git, holds, parseJsonObject, type Verdict, violated } from './verdict.ts'
import { readWorkspace, workspacePackageDirs } from './workspace.ts'

type Json = Readonly<Record<string, unknown>>
type Kind = 'library' | 'application' | 'template'

const KINDS: readonly string[] = ['library', 'application', 'template']
const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']
const MAX_ENTRIES = 8
const RUNTIME_MODULE = /^(react|react-dom|astro|vite|node:.*|cloudflare:.*|@cloudflare\/.*)(\/.*)?$/
const SOURCE_FILE = /\.(ts|tsx|mts)$/
const SKIPPED_DIRS = new Set(['node_modules', 'dist', 'build', '.turbo', '.git', '.alchemy', '.wrangler'])
const TEST_FILE = /(\.(test|spec)\.[cm]?[jt]sx?$)|(^|\/)(__tests__|tests?|e2e)\//

export interface SourceFile {
  readonly path: string
  readonly rel: string
  readonly isTest: boolean
  readonly text: string
  /** The text with comments dropped and string, template and regex contents masked: what is left is code. */
  readonly code: string
  readonly specifiers: readonly string[]
}

export interface Unit {
  readonly dir: string
  readonly rel: string
  readonly name: string
  readonly manifest: Json
  readonly kind: Kind | undefined
  readonly files: readonly SourceFile[]
}

export interface Workspace {
  readonly root: string
  readonly units: readonly Unit[]
  readonly byName: ReadonlyMap<string, Unit>
}

const stripComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`\\])\/\/[^\n]*/gm, '$1')

/** JSONC to JSON: comments dropped outside strings (a path glob holds `/*`), then trailing commas. */
const stripJsonc = (text: string): string => {
  let out = ''
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!
    if (c === '"') {
      let j = i + 1
      while (j < text.length && text[j] !== '"') j += text[j] === '\\' ? 2 : 1
      out += text.slice(i, j + 1)
      i = j
    } else if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++
      out += '\n'
    } else if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2)
      i = end < 0 ? text.length : end + 1
    } else out += c
  }
  return out.replace(/,(\s*[}\]])/g, '$1')
}

/** A string literal is kept in the masked code as '\u0001N\u0001', N indexing the literal's value. */
const MASK = '\u0001'
const IMPORT_PATTERNS = [
  /\b(?:import|export)\s[^'"`;]*?\bfrom\s*'\u0001(\d+)\u0001'/g,
  /\bimport\s*'\u0001(\d+)\u0001'/g,
  /\b(?:import|require)\s*\(\s*'\u0001(\d+)\u0001'\s*\)/g,
]
const REGEX_PRECEDERS = new Set([
  '',
  '(',
  ',',
  '=',
  ':',
  '[',
  '!',
  '&',
  '|',
  '?',
  '{',
  '}',
  ';',
  '+',
  '-',
  '*',
  '%',
  '<',
  '>',
  '~',
  '^',
])

/**
 * One pass over source text that tells code from comments and literals: comments are dropped, a string is
 * replaced by a numbered marker, template text and regex bodies are blanked (a `${}` expression stays code).
 * A specifier or an env reference inside a literal, such as a lint-rule fixture, is therefore not code.
 */
export const lex = (text: string): { readonly code: string; readonly strings: readonly string[] } => {
  const strings: string[] = []
  let out = ''
  const braces: number[] = [] // brace depth at which each open template expression resumes the template
  let depth = 0
  const significant = () => out.trimEnd().slice(-1)
  const template = (from: number): number => {
    // Reads template text from `from` (just after a backtick or a closing brace) up to `${` or the closing backtick.
    let i = from
    while (i < text.length) {
      if (text[i] === '\\') i += 2
      else if (text[i] === '`') {
        out += '`'
        return i + 1
      } else if (text[i] === '$' && text[i + 1] === '{') {
        braces.push(depth)
        depth++
        out += '`${'
        return i + 2
      } else i++
    }
    return i
  }
  let i = 0
  while (i < text.length) {
    const c = text[i]!
    const next = text[i + 1]
    if (c === '/' && next === '/') {
      while (i < text.length && text[i] !== '\n') i++
    } else if (c === '/' && next === '*') {
      const end = text.indexOf('*/', i + 2)
      i = end < 0 ? text.length : end + 2
      out += ' '
    } else if (c === '"' || c === "'") {
      let j = i + 1
      while (j < text.length && text[j] !== c && text[j] !== '\n') j += text[j] === '\\' ? 2 : 1
      strings.push(text.slice(i + 1, j))
      out += `'${MASK}${strings.length - 1}${MASK}'`
      i = j + 1
    } else if (c === '`') {
      out += '`'
      i = template(i + 1)
    } else if (c === '{') {
      depth++
      out += c
      i++
    } else if (c === '}') {
      depth--
      out += c
      i++
      if (braces.length > 0 && braces[braces.length - 1] === depth) {
        braces.pop()
        i = template(i)
      }
    } else if (c === '/' && REGEX_PRECEDERS.has(significant())) {
      let j = i + 1
      let inClass = false
      while (j < text.length && text[j] !== '\n' && (inClass || text[j] !== '/')) {
        if (text[j] === '\\') j++
        else if (text[j] === '[') inClass = true
        else if (text[j] === ']') inClass = false
        j++
      }
      out += '/ /'
      i = j + 1
    } else {
      out += c
      i++
    }
  }
  return { code: out, strings }
}

const specifiersIn = ({ code, strings }: { readonly code: string; readonly strings: readonly string[] }) => {
  const found = new Set<string>()
  for (const pattern of IMPORT_PATTERNS) for (const m of code.matchAll(pattern)) found.add(strings[Number(m[1])]!)
  return [...found]
}

export const specifiersOf = (text: string): readonly string[] => specifiersIn(lex(text))

const collectSources = async (dir: string, base: string, out: SourceFile[]): Promise<void> => {
  for await (const entry of Deno.readDir(dir)) {
    const path = join(dir, entry.name)
    if (entry.isDirectory) {
      if (!SKIPPED_DIRS.has(entry.name)) await collectSources(path, base, out)
    } else if (entry.isFile && SOURCE_FILE.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      const text = await Deno.readTextFile(path)
      const rel = relative(base, path)
      const lexed = lex(text)
      out.push({ path, rel, isTest: TEST_FILE.test(rel), text, code: lexed.code, specifiers: specifiersIn(lexed) })
    }
  }
}

export const loadWorkspace = async (root: string): Promise<Workspace> => {
  const dirs = await workspacePackageDirs(root, await readWorkspace(root))
  const units: Unit[] = []
  for (const dir of dirs) {
    const manifest = parseJsonObject(await Deno.readTextFile(join(dir, 'package.json')), join(dir, 'package.json'))
    const files: SourceFile[] = []
    await collectSources(dir, dir, files)
    const unit = manifest['unit']
    units.push({
      dir,
      rel: relative(root, dir) || '.',
      name: typeof manifest['name'] === 'string' ? manifest['name'] : relative(root, dir),
      manifest,
      kind: typeof unit === 'string' && KINDS.includes(unit) ? (unit as Kind) : undefined,
      files,
    })
  }
  return { root, units, byName: new Map(units.map((u) => [u.name, u])) }
}

const sourcesOf = (unit: Unit): readonly SourceFile[] => unit.files.filter((f) => !f.isTest)

const isLibrary = (unit: Unit): boolean => unit.kind === 'library'

/** A unit that has not declared its kind yet is judged as a library; composition-unit-kinds reports the missing kind. */
const judgedAsLibrary = (unit: Unit): boolean => unit.kind === undefined || isLibrary(unit)

/** The workspace package a bare specifier names, with the subpath it asks for ('.' for the root). */
const targetOf = (ws: Workspace, specifier: string): { readonly unit: Unit; readonly subpath: string } | undefined => {
  if (specifier.startsWith('.') || specifier.startsWith('/')) return undefined
  const parts = specifier.split('/')
  const name = specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]!
  const unit = ws.byName.get(name)
  if (unit === undefined) return undefined
  const rest = specifier.slice(name.length)
  return { unit, subpath: rest === '' ? '.' : `.${rest}` }
}

const declaredDependencies = (unit: Unit): ReadonlySet<string> => {
  const names = new Set<string>()
  for (const field of DEPENDENCY_FIELDS) {
    const deps = unit.manifest[field]
    if (typeof deps === 'object' && deps !== null) { for (const name of Object.keys(deps)) names.add(name) }
  }
  return names
}

/** Workspace packages a unit's source (tests included) imports, other than itself. */
const importedUnits = (ws: Workspace, unit: Unit): ReadonlySet<string> => {
  const names = new Set<string>()
  for (const file of unit.files) {
    for (const spec of file.specifiers) {
      const target = targetOf(ws, spec)
      if (target !== undefined && target.unit !== unit) names.add(target.unit.name)
    }
  }
  return names
}

const exportsOf = (unit: Unit): Json | undefined => {
  const value = unit.manifest['exports']
  if (typeof value === 'string') return { '.': value }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const record = value as Json
  return Object.keys(record).some((key) => key.startsWith('.')) ? record : { '.': record }
}

/** Every concrete string target of an exports entry, across its conditions. */
const leaves = (target: unknown): readonly string[] => {
  if (typeof target === 'string') return [target]
  if (Array.isArray(target)) return target.flatMap(leaves)
  if (typeof target === 'object' && target !== null) return Object.values(target).flatMap(leaves)
  return []
}

const matchesKey = (key: string, subpath: string): boolean => {
  if (key === subpath) return true
  const star = key.indexOf('*')
  if (star < 0) return false
  const head = key.slice(0, star)
  const tail = key.slice(star + 1)
  return subpath.length >= key.length - 1 && subpath.startsWith(head) && subpath.endsWith(tail)
}

/** Whether the exports map admits the subpath: the most specific matching key must not be null. */
const exported = (exportsMap: Json, subpath: string): boolean => {
  const keys = Object.keys(exportsMap).filter((key) => matchesKey(key, subpath))
  if (keys.length === 0) return false
  const best = keys.sort((a, b) => b.length - a.length)[0]!
  return exportsMap[best] !== null
}

const sortedUnique = (lines: readonly string[]): readonly string[] => [...new Set(lines)].sort()

const finish = (name: string, violations: readonly string[], why: string, summary: string): Verdict =>
  violations.length === 0 ? holds(summary) : violated(sortedUnique(violations), `${name}: ${why}`)

// ---------------------------------------------------------------- unit kinds

export const checkCompositionUnitKinds = async (root: string): Promise<Verdict> => {
  const ws = await loadWorkspace(root)
  const violations: string[] = []
  for (const unit of ws.units) {
    const declared = unit.manifest['unit']
    if (declared === undefined) {
      violations.push(`${unit.rel} (${unit.name}): no "unit" declared; expected library, application or template`)
      continue
    }
    if (unit.kind === undefined) {
      violations.push(
        `${unit.rel} (${unit.name}): "unit": ${JSON.stringify(declared)} is not library, application or template`,
      )
      continue
    }
    if (unit.kind === 'application') {
      if (unit.manifest['private'] !== true) {
        violations.push(`${unit.rel} (${unit.name}): an application must be "private": true`)
      }
      if (unit.manifest['exports'] !== undefined) {
        violations.push(`${unit.rel} (${unit.name}): an application has no "exports"`)
      }
    }
    if (unit.kind === 'library') {
      const scripts = unit.manifest['scripts']
      const deploy = typeof scripts === 'object' && scripts !== null
        ? Object.keys(scripts).filter((s) => s === 'deploy' || s.startsWith('deploy:'))
        : []
      if (deploy.length > 0) {
        violations.push(`${unit.rel} (${unit.name}): a library has no deploy script (${deploy.join(', ')})`)
      }
    }
  }
  return finish(
    'composition-unit-kinds',
    violations,
    "every workspace unit declares library, application or template, and its manifest has that kind's shape (compound-packs/composition/three-unit-kinds.md).",
    `${ws.units.length} workspace units declare their kind`,
  )
}

// --------------------------------------------------------------------- graph

const ENV_REFERENCES: readonly (readonly [RegExp, string])[] = [
  [/\bprocess\.env\b/, 'process.env'],
  [/\bDeno\.env\b/, 'Deno.env'],
  [/\bimport\.meta\.env\b/, 'import.meta.env'],
  // (env: Env), (req, env: Cloudflare.Env), ({ env }: { env: Env }), env: Bindings; not env: Environment.
  [/[(,{]\s*env\s*\??:\s*(?:[\w.]*\.)?\w*(?:Env|Bindings)\b/, 'a Cloudflare env parameter named env'],
  // fetch(req, { env }) and ({ env }: Ctx): env destructured in a parameter list.
  [/[(,]\s*\{[^{}]*\benv\b[^{}]*\}\s*[:,)=]/, 'a Cloudflare env parameter named env'],
]

const findCycles = (edges: ReadonlyMap<string, ReadonlySet<string>>): readonly (readonly string[])[] => {
  // Tarjan's strongly connected components; a component of two or more nodes is a cycle.
  let counter = 0
  const index = new Map<string, number>()
  const low = new Map<string, number>()
  const onStack = new Set<string>()
  const stack: string[] = []
  const cycles: string[][] = []
  const visit = (node: string): void => {
    index.set(node, counter)
    low.set(node, counter)
    counter++
    stack.push(node)
    onStack.add(node)
    for (const next of edges.get(node) ?? []) {
      if (!index.has(next)) {
        visit(next)
        low.set(node, Math.min(low.get(node)!, low.get(next)!))
      } else if (onStack.has(next)) low.set(node, Math.min(low.get(node)!, index.get(next)!))
    }
    if (low.get(node) === index.get(node)) {
      const component: string[] = []
      let member: string
      do {
        member = stack.pop()!
        onStack.delete(member)
        component.push(member)
      } while (member !== node)
      if (component.length > 1) cycles.push(component.sort())
    }
  }
  for (const node of [...edges.keys()].sort()) if (!index.has(node)) visit(node)
  return cycles
}

export const checkCompositionGraph = async (root: string): Promise<Verdict> => {
  const ws = await loadWorkspace(root)
  const violations: string[] = []
  const edges = new Map<string, Set<string>>(ws.units.map((u) => [u.name, new Set<string>()]))
  for (const unit of ws.units) {
    const declared = declaredDependencies(unit)
    const imported = importedUnits(ws, unit)
    for (const name of new Set([...declared, ...imported])) {
      const target = ws.byName.get(name)
      if (target === undefined || target === unit) continue
      edges.get(unit.name)!.add(name)
      if (target.kind === 'application') {
        violations.push(
          `${unit.name} -> ${name}: an edge into an application (${declared.has(name) ? 'declared' : 'imported'})`,
        )
      }
      if (imported.has(name) && !declared.has(name)) {
        violations.push(`${unit.name} imports ${name} without declaring it`)
      }
      if (declared.has(name) && !imported.has(name)) {
        violations.push(`${unit.name} declares ${name} but never imports it`)
      }
    }
    if (judgedAsLibrary(unit)) {
      const core = unit.manifest['layer'] === 'core'
      for (const file of sourcesOf(unit)) {
        const toolConfig = /(^|\/)[^/]*\.config\.[cm]?[jt]s$/.test(file.rel) // vitest.config.ts and kin configure tools, they are not library code
        if (core) {
          for (const spec of file.specifiers.filter((s) => RUNTIME_MODULE.test(s))) {
            violations.push(`${unit.name}: core library ${file.rel} imports the runtime or framework module ${spec}`)
          }
        }
        for (const [pattern, label] of ENV_REFERENCES) {
          if (!toolConfig && pattern.test(file.code)) {
            violations.push(
              `${unit.name}: library ${file.rel} references ${label}; only applications read configuration`,
            )
          }
        }
      }
    }
  }
  for (const cycle of findCycles(edges)) violations.push(`cycle: ${cycle.join(' <-> ')}`)
  return finish(
    'composition-graph',
    violations,
    'edges point from applications to libraries, declared dependencies match imports, the graph has no cycle, core libraries import no runtime, and libraries read no environment (compound-packs/composition/dependency-direction.md, core-and-adapters.md, config-at-the-edge.md).',
    `${ws.units.length} units, ${[...edges.values()].reduce((n, e) => n + e.size, 0)} edges, no violation`,
  )
}

// ------------------------------------------------------------------- entries

const readmeExempts = async (unit: Unit): Promise<boolean> => {
  try {
    return /^#+\s*Composition exceptions\s*$/im.test(await Deno.readTextFile(join(unit.dir, 'README.md')))
  } catch (cause) {
    if (cause instanceof Deno.errors.NotFound) return false
    throw cause
  }
}

const hasFolder = async (path: string): Promise<boolean> => {
  try {
    return (await Deno.stat(path)).isDirectory
  } catch (cause) {
    if (cause instanceof Deno.errors.NotFound) return false
    throw cause
  }
}

/** Folders a target sits under, relative to src (or the package root when it has no src), wildcards dropped. */
const targetFolders = (target: string): readonly string[] => {
  const parts = target.replace(/^\.\//, '').split('/').slice(0, -1)
  if (parts[0] === 'dist' || parts[0] === 'build') return [] // build output mirrors source by construction; the source condition is judged
  return (parts[0] === 'src' ? parts.slice(1) : parts).filter((p) => !p.includes('*'))
}

export const checkCompositionEntries = async (root: string): Promise<Verdict> => {
  const ws = await loadWorkspace(root)
  const violations: string[] = []
  let libraries = 0
  for (const unit of ws.units.filter(judgedAsLibrary)) {
    libraries++
    const map = exportsOf(unit)
    if (map === undefined) continue
    const keys = Object.keys(map)
    if (keys.length > MAX_ENTRIES && !(await readmeExempts(unit))) {
      violations.push(
        `${unit.rel} (${unit.name}): ${keys.length} exports entries, over ${MAX_ENTRIES}; split roles or record a "Composition exceptions" heading in its README`,
      )
    }
    for (const key of keys) {
      const deep = leaves(map[key]).find((t) => targetFolders(t).length >= 2)
      if (deep !== undefined) {
        violations.push(
          `${unit.rel} (${unit.name}): entry ${key} -> ${deep} mirrors a source folder ${
            targetFolders(deep).length
          } levels deep`,
        )
      }
    }
    const hasInternal = (await hasFolder(join(unit.dir, 'src', 'internal'))) ||
      (await hasFolder(join(unit.dir, 'internal')))
    if (hasInternal && !(Object.hasOwn(map, './internal/*') && map['./internal/*'] === null)) {
      violations.push(`${unit.rel} (${unit.name}): has an internal folder but no "./internal/*": null`)
    }
    if (unit.manifest['private'] === true) {
      const byFile = new Map<string, string[]>()
      for (const key of keys) {
        for (const leaf of new Set(leaves(map[key]).map((t) => t.replace(/^\.\//, '')))) {
          byFile.set(leaf, [...(byFile.get(leaf) ?? []), key])
        }
      }
      for (const [file, specifiers] of byFile) {
        if (specifiers.length > 1) {
          violations.push(
            `${unit.rel} (${unit.name}): ${
              specifiers.join(' and ')
            } both resolve to ${file}; a private library keeps no alias`,
          )
        }
      }
    }
  }
  return finish(
    'composition-entries',
    violations,
    'a library has at most 8 entries, none mirroring the source tree, blocks ./internal/*, and a private one keeps no alias (compound-packs/composition/role-entries-only.md, unpublished-surfaces-are-free.md).',
    `${libraries} libraries keep their entries to roles`,
  )
}

// ------------------------------------------------------------------- imports

const readJsonc = async (path: string): Promise<Json | undefined> => {
  try {
    return JSON.parse(stripJsonc(await Deno.readTextFile(path))) as Json
  } catch {
    // A tsconfig that does not parse as JSONC states no paths this check can judge.
    return undefined
  }
}

const unitContaining = (ws: Workspace, path: string, except: Unit): Unit | undefined =>
  ws.units.find((u) => u !== except && (path === u.dir || path.startsWith(u.dir + '/')))

const noExt = (path: string): string => path.replace(/\.(d\.)?[cm]?[jt]sx?$/, '')

const CONFIG_FILE = /^(vite|vitest|vitest\.workspace|astro)\.config\.[cm]?[jt]s$/

const configFiles = async (unit: Unit): Promise<readonly { path: string; kind: 'tsconfig' | 'bundler' }[]> => {
  const found: { path: string; kind: 'tsconfig' | 'bundler' }[] = []
  for await (const entry of Deno.readDir(unit.dir)) {
    if (!entry.isFile) continue
    if (/^tsconfig(\..+)?\.json$/.test(entry.name)) found.push({ path: join(unit.dir, entry.name), kind: 'tsconfig' })
    else if (CONFIG_FILE.test(entry.name)) found.push({ path: join(unit.dir, entry.name), kind: 'bundler' })
  }
  return found
}

export const checkCompositionImports = async (root: string): Promise<Verdict> => {
  const ws = await loadWorkspace(root)
  const violations: string[] = []
  // Non-test and test use of every export target, by package and entry key.
  const used = new Map<string, { source: boolean; test: boolean }>()
  const usage = (unit: Unit, key: string) => {
    const id = `${unit.name}\u0000${key}`
    if (!used.has(id)) used.set(id, { source: false, test: false })
    return used.get(id)!
  }
  const targetFiles = new Map<string, { unit: Unit; keys: string[] }>()
  for (const unit of ws.units) {
    const map = exportsOf(unit)
    if (map === undefined) continue
    for (const [key, value] of Object.entries(map)) {
      for (const leaf of leaves(value)) {
        const abs = noExt(resolve(unit.dir, leaf))
        const entry = targetFiles.get(abs) ?? { unit, keys: [] }
        entry.keys.push(key)
        targetFiles.set(abs, entry)
      }
    }
  }
  for (const unit of ws.units) {
    for (const file of unit.files) {
      for (const spec of file.specifiers) {
        const target = targetOf(ws, spec)
        if (target !== undefined) {
          const map = exportsOf(target.unit)
          if (target.unit !== unit && map !== undefined && !exported(map, target.subpath)) {
            violations.push(`${unit.name} ${file.rel}: imports ${spec}, which ${target.unit.name} does not export`)
          }
          if (target.unit !== unit && spec.includes('/src/')) {
            violations.push(`${unit.name} ${file.rel}: imports ${spec} through another package's /src/`)
          }
          if (map !== undefined) {
            for (const key of Object.keys(map).filter((k) => matchesKey(k, target.subpath))) {
              usage(target.unit, key)[file.isTest ? 'test' : 'source'] = true
            }
          }
        } else if (spec.startsWith('.')) {
          const abs = resolve(dirname(file.path), spec)
          const other = unitContaining(ws, abs, unit)
          if (other !== undefined && spec.includes('/src/')) {
            violations.push(`${unit.name} ${file.rel}: imports ${spec}, a path into ${other.name}'s source`)
          }
          const hit = targetFiles.get(noExt(abs)) ?? targetFiles.get(abs)
          if (hit !== undefined) {
            for (const key of hit.keys) usage(hit.unit, key)[file.isTest ? 'test' : 'source'] = true
          }
        }
      }
    }
    for (const config of await configFiles(unit)) {
      if (config.kind === 'tsconfig') {
        const compilerOptions = (await readJsonc(config.path))?.['compilerOptions'] as Json | undefined
        const paths = compilerOptions?.['paths'] as Json | undefined
        const base = resolve(
          dirname(config.path),
          typeof compilerOptions?.['baseUrl'] === 'string' ? compilerOptions['baseUrl'] : '.',
        )
        for (const [alias, targets] of Object.entries(paths ?? {})) {
          for (const target of Array.isArray(targets) ? targets : []) {
            const other = typeof target === 'string' ? unitContaining(ws, resolve(base, target), unit) : undefined
            if (other !== undefined) {
              violations.push(
                `${unit.rel}: ${relative(root, config.path)} paths ${alias} points into ${other.name}'s source`,
              )
            }
          }
        }
      } else {
        const text = stripComments(await Deno.readTextFile(config.path))
        if (!/\balias\b/.test(text)) continue
        for (const m of text.matchAll(/['"`]([^'"`\n]+)['"`]/g)) {
          const literal = m[1]!
          const abs = literal.startsWith('.') ? resolve(unit.dir, literal) : literal
          const other = literal.startsWith('.') ? unitContaining(ws, abs, unit) : undefined
          const named = targetOf(ws, literal)
          if (other !== undefined) {
            violations.push(
              `${unit.rel}: ${relative(root, config.path)} alias points into ${other.name}'s source (${literal})`,
            )
          } else if (named !== undefined && named.unit !== unit && literal.includes('/src')) {
            violations.push(
              `${unit.rel}: ${relative(root, config.path)} alias points into ${named.unit.name}'s source (${literal})`,
            )
          }
        }
      }
    }
  }
  for (const unit of ws.units) {
    const map = exportsOf(unit)
    if (map === undefined) continue
    for (const key of Object.keys(map)) {
      // The root entry, a published library's entries (outside consumers are not in this workspace), and the
      // ./testing and ./test-* helper entries (test support is meant for tests) are not judged.
      if (
        key === '.' || key === './package.json' || key.includes('*') || key.startsWith('./testing') ||
        key.startsWith('./test-') || unit.manifest['private'] !== true
      ) continue
      const seen = used.get(`${unit.name}\u0000${key}`)
      if (seen !== undefined && seen.test && !seen.source) {
        violations.push(`${unit.rel} (${unit.name}): export ${key} is imported only by test files`)
      }
    }
  }
  return finish(
    'composition-imports',
    violations,
    'packages import each other only through exported specifiers (never /src/, a path alias or an alias into source), and nothing is exported only so a test can reach it (compound-packs/composition/tests-stay-home.md, source-condition-resolution.md).',
    `${ws.units.length} units import each other through public specifiers only`,
  )
}

// ----------------------------------------------------------------- contracts

export const checkCompositionContracts = async (root: string): Promise<Verdict> => {
  const ws = await loadWorkspace(root)
  const violations: string[] = []
  const contracts = ws.units.filter((u) => u.manifest['role'] === 'contracts')
  for (const unit of contracts) {
    for (const file of sourcesOf(unit)) {
      for (const spec of file.specifiers) {
        const target = targetOf(ws, spec)
        if (target !== undefined && target.unit !== unit && target.unit.manifest['role'] !== 'contracts') {
          violations.push(
            `${unit.name} ${file.rel}: a contracts package imports ${target.unit.name}, which is not contracts`,
          )
        }
      }
      const layer = /\bLayer\.(effect|succeed|scoped|sync)\b/.exec(file.code)
      if (layer !== null) violations.push(`${unit.name} ${file.rel}: a contracts package defines a Layer (${layer[0]})`)
    }
  }
  return finish(
    'composition-contracts',
    violations,
    'a contracts package imports only contracts packages and binds no Layer (compound-packs/composition/contracts-between-applications.md).',
    `${contracts.length} contracts packages import only contracts and define no Layer`,
  )
}

// --------------------------------------------------------------- granularity

export interface CoChange {
  readonly a: string
  readonly b: string
  readonly together: number
  readonly of: number
}

const WINDOW = 50
const MIN_WINDOW = 10
const CO_CHANGE_RATIO = 0.8

/** Pairs changed together in more than 80% of the last 50 commits touching either (at least 10 touching commits). */
export const coChanged = (commits: readonly ReadonlySet<string>[]): readonly CoChange[] => {
  const names = [...new Set(commits.flatMap((c) => [...c]))].sort()
  const found: CoChange[] = []
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const a = names[i]!
      const b = names[j]!
      let of = 0
      let together = 0
      for (const touched of commits) { // newest first
        const hasA = touched.has(a)
        const hasB = touched.has(b)
        if (!hasA && !hasB) continue
        of++
        if (hasA && hasB) together++
        if (of === WINDOW) break
      }
      if (of >= MIN_WINDOW && together / of > CO_CHANGE_RATIO) found.push({ a, b, together, of })
    }
  }
  return found
}

const commitsTouching = async (ws: Workspace, libraries: readonly Unit[]): Promise<readonly ReadonlySet<string>[]> => {
  const out = await git([
    '-C',
    ws.root,
    'log',
    '--name-only',
    '--no-renames',
    '-n',
    '2000',
    '--format=%x1e',
    '--',
    ...libraries.map((u) => u.rel),
  ])
  return out.split('\x1e').slice(1).map((block) => {
    const touched = new Set<string>()
    for (const line of block.split('\n')) {
      const path = join(ws.root, line.trim())
      const owner = line.trim() === '' ? undefined : libraries.find((u) => path.startsWith(u.dir + '/'))
      if (owner !== undefined) touched.add(owner.name)
    }
    return touched
  })
}

export const checkCompositionGranularity = async (root: string, strict: boolean): Promise<Verdict> => {
  const ws = await loadWorkspace(root)
  const findings: string[] = []
  const libraries = ws.units.filter(isLibrary)
  for (const library of libraries) {
    const dependents = ws.units.filter((u) =>
      u !== library && (declaredDependencies(u).has(library.name) || importedUnits(ws, u).has(library.name))
    )
    if (dependents.length === 1 && library.manifest['private'] === true) {
      findings.push(
        `${library.rel} (${library.name}): one dependent (${
          dependents[0]!.name
        }) and not published; merge it into its consumer`,
      )
    }
  }
  if (libraries.length > 1) {
    for (const { a, b, together, of } of coChanged(await commitsTouching(ws, libraries))) {
      findings.push(
        `${a} and ${b} changed together in ${together} of the last ${of} commits touching either; merge them`,
      )
    }
  }
  if (findings.length === 0) return holds('no single-consumer library and no always-co-changed pair')
  const sorted = sortedUnique(findings)
  if (strict) {
    return violated(
      sorted,
      'composition-granularity --strict: split a library by consumer and merge by co-change (compound-packs/composition/split-by-consumer-merge-by-co-change.md).',
    )
  }
  return holds(
    `${sorted.length} finding(s) reported; --strict fails on them\n${sorted.map((f) => `  ${f}`).join('\n')}`,
  )
}
