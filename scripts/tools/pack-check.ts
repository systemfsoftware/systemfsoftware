// pack-check - packs one workspace package and judges the tarball a consumer would install.
//
//   pack-check [--package-directory <dir>] [--forbid <pattern>]...
//              [--require-export <subpath>=<name>]... [--require-literal <subpath>=<text>]...
//
// Packs <dir> (default `.`) with `pnpm pack --config.ignore-scripts=true` into a fresh directory outside the
// repository, so a lifecycle hook can neither rebuild nor dirty what is judged, then reads the tarball:
//
// - every tarball: `package/dist/` holds a file, and every `exports` and `bin` target of the packed
//   `package/package.json` (the manifest pnpm wrote, with `publishConfig.exports` applied) is in the tarball;
// - `--forbid`: no shipped ES module (`.mjs`, `.js`) imports a matching specifier. A pattern is a package name
//   (`playwright`), a scope (`@playwright/*`), or `node:*` for every Node built-in, prefixed or bare;
// - `--require-export <subpath>=<name>`: the module the `exports` subpath resolves to exports `<name>`;
// - `--require-literal <subpath>=<text>`: `<text>` appears as a quoted string in that module or in a module it
//   statically imports inside the tarball (a bundler may move the literal into a chunk).
//
// The rules come from the packed manifest and from the command-line arguments, never from the package's name or
// location. Prints one line per finding and exits 1 on any. A tarball without a readable manifest, a module the
// lexer cannot read, or bad arguments is refused: exit 1 with the cause on stderr.

import { untar } from '@andrewbranch/untar.js'
import { parseArgs } from '@std/cli/parse-args'
import { join } from '@std/path'
import { Result, Schema } from 'effect'
import { type Export, type Import, init, parse } from 'es-module-lexer'
import { builtinModules } from 'node:module'

/** One subpath requirement given on the command line: `<subpath>=<value>`. */
export interface Requirement {
  readonly subpath: string
  readonly value: string
}

export interface Rules {
  readonly forbid: readonly string[]
  readonly requireExport: readonly Requirement[]
  readonly requireLiteral: readonly Requirement[]
}

export type Finding =
  | { readonly _tag: 'DistMissing' }
  | { readonly _tag: 'TargetMissing'; readonly entry: string; readonly path: string }
  | { readonly _tag: 'ForbiddenImport'; readonly file: string; readonly specifier: string; readonly pattern: string }
  | { readonly _tag: 'RequiredExportMissing'; readonly subpath: string; readonly file: string; readonly name: string }
  | { readonly _tag: 'RequiredLiteralMissing'; readonly subpath: string; readonly file: string; readonly text: string }

export type Judgement =
  | { readonly kind: 'judged'; readonly findings: readonly Finding[] }
  | { readonly kind: 'refused'; readonly reason: string }

/** Tarball contents keyed by path below the tarball's `package/` root, e.g. `dist/index.mjs`. */
export type Files = ReadonlyMap<string, Uint8Array>

const Manifest = Schema.Struct({
  exports: Schema.optional(Schema.Unknown),
  bin: Schema.optional(Schema.Union([Schema.String, Schema.Record(Schema.String, Schema.String)])),
})

const decodeManifest = Schema.decodeUnknownResult(Manifest)

const refused = (reason: string): Judgement => ({ kind: 'refused', reason })

const fileOf = (target: string): string => target.replace(/^\.\//, '')

/** Every string target in an `exports` tree, paired with the subpath it is published under. */
const exportTargets = (exports: unknown, entry = '.'): readonly { entry: string; path: string }[] => {
  if (typeof exports === 'string') return [{ entry, path: exports }]
  if (exports === null || typeof exports !== 'object') return []
  return Object.entries(exports).flatMap(([key, value]) => exportTargets(value, key.startsWith('.') ? key : entry))
}

/** The file a runtime `import` of `subpath` loads: the `import` condition, else `default`. */
const runtimeTarget = (exports: unknown, subpath: string): string | undefined => {
  const pick = (value: unknown): string | undefined => {
    if (typeof value === 'string') return value
    if (value === null || typeof value !== 'object') return undefined
    const conditions = value as Record<string, unknown>
    return pick(conditions['import']) ?? pick(conditions['default'])
  }
  if (typeof exports === 'string') return subpath === '.' ? exports : undefined
  if (exports === null || typeof exports !== 'object') return undefined
  const map = exports as Record<string, unknown>
  // A map keyed by subpaths, or one conditions object that stands for `.` alone.
  if (Object.keys(map).some((key) => key.startsWith('.'))) return pick(map[subpath])
  return subpath === '.' ? pick(map) : undefined
}

const packageOf = (specifier: string): string => {
  const parts = specifier.split('/')
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
}

const isBare = (specifier: string): boolean =>
  !specifier.startsWith('.') && !specifier.startsWith('/') &&
  (!specifier.includes(':') || specifier.startsWith('node:'))

/** The first `--forbid` pattern `specifier` matches, if any. */
const forbiddenBy = (
  specifier: string,
  patterns: readonly string[],
  builtins: ReadonlySet<string>,
): string | undefined => {
  if (!isBare(specifier)) return undefined
  const name = packageOf(specifier)
  return patterns.find((pattern) => {
    if (pattern === 'node:*') return specifier.startsWith('node:') || builtins.has(name)
    if (pattern.endsWith('/*')) return name.startsWith(pattern.slice(0, -1))
    return name === pattern
  })
}

const isModule = (path: string): boolean => path.endsWith('.mjs') || path.endsWith('.js')

const resolveRelative = (from: string, specifier: string): string => {
  const parts = from.split('/').slice(0, -1)
  for (const segment of specifier.split('/')) {
    if (segment === '..') parts.pop()
    else if (segment !== '.') parts.push(segment)
  }
  return parts.join('/')
}

/** What the lexer reads from one shipped module. */
interface LexedModule {
  readonly imports: readonly Import[]
  readonly exports: readonly Export[]
}

/** Judges a tarball's files against the manifest-derived rules and the package's declared `rules`. */
export const judge = async (files: Files, rules: Rules, builtins: ReadonlySet<string>): Promise<Judgement> => {
  const manifestBytes = files.get('package.json')
  if (manifestBytes === undefined) return refused('the tarball holds no package/package.json')
  let raw: unknown
  try {
    raw = JSON.parse(new TextDecoder().decode(manifestBytes))
  } catch (error) {
    return refused(`package/package.json is not JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
  const decoded = decodeManifest(raw)
  if (Result.isFailure(decoded)) return refused(`package/package.json is unreadable: ${decoded.failure.message}`)
  const manifest = decoded.success

  await init
  const lexed = new Map<string, LexedModule>()
  const text = new Map<string, string>()
  for (const [path, bytes] of files) {
    if (!isModule(path)) continue
    const source = new TextDecoder().decode(bytes)
    text.set(path, source)
    try {
      const [imports, exports] = parse(source, path)
      lexed.set(path, { imports, exports })
    } catch (error) {
      return refused(`cannot lex ${path}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const findings: Finding[] = []

  if (![...files.keys()].some((path) => path.startsWith('dist/'))) findings.push({ _tag: 'DistMissing' })

  const bins = typeof manifest.bin === 'string' ? { bin: manifest.bin } : manifest.bin ?? {}
  const targets = [
    ...exportTargets(manifest.exports),
    ...Object.entries(bins).map(([name, path]) => ({ entry: `bin ${name}`, path })),
  ]
  for (const { entry, path } of targets) {
    if (!path.includes('*') && !files.has(fileOf(path))) findings.push({ _tag: 'TargetMissing', entry, path })
  }

  for (const [file, { imports }] of lexed) {
    for (const record of imports) {
      if (typeof record.specifier !== 'string') continue
      const pattern = forbiddenBy(record.specifier, rules.forbid, builtins)
      if (pattern !== undefined) findings.push({ _tag: 'ForbiddenImport', file, specifier: record.specifier, pattern })
    }
  }

  const entryFile = (subpath: string): string | undefined => {
    const target = runtimeTarget(manifest.exports, subpath)
    return target === undefined ? undefined : fileOf(target)
  }

  for (const { subpath, value: name } of rules.requireExport) {
    const file = entryFile(subpath) ?? subpath
    const exported = lexed.get(file)?.exports.some((record) => 'name' in record && record.name === name) ?? false
    if (!exported) findings.push({ _tag: 'RequiredExportMissing', subpath, file, name })
  }

  for (const { subpath, value } of rules.requireLiteral) {
    const file = entryFile(subpath) ?? subpath
    const quoted = [`'${value}'`, `"${value}"`, `\`${value}\``]
    const seen = new Set<string>()
    const pending = [file]
    let found = false
    while (pending.length > 0 && !found) {
      const current = pending.pop() as string
      if (seen.has(current)) continue
      seen.add(current)
      const source = text.get(current)
      if (source === undefined) continue
      found = quoted.some((literal) => source.includes(literal))
      for (const record of lexed.get(current)?.imports ?? []) {
        if (record.type === 'static' || record.type === 'reexport-star') {
          if (record.specifier.startsWith('.')) pending.push(resolveRelative(current, record.specifier))
        }
      }
    }
    if (!found) findings.push({ _tag: 'RequiredLiteralMissing', subpath, file, text: value })
  }

  return { kind: 'judged', findings }
}

/** One line naming the rule a finding breaks and where. */
export const describe = (finding: Finding): string => {
  switch (finding._tag) {
    case 'DistMissing':
      return 'DistMissing: the tarball ships no file under dist/'
    case 'TargetMissing':
      return `TargetMissing: ${finding.entry} points at ${finding.path}, which the tarball does not hold`
    case 'ForbiddenImport':
      return `ForbiddenImport: ${finding.file} imports ${finding.specifier} (forbidden by ${finding.pattern})`
    case 'RequiredExportMissing':
      return `RequiredExportMissing: ${finding.subpath} (${finding.file}) does not export ${finding.name}`
    case 'RequiredLiteralMissing':
      return `RequiredLiteralMissing: '${finding.text}' is in neither ${finding.subpath} (${finding.file}) nor a module it imports`
  }
}

/** The files of a gzipped tarball, keyed by path below its first directory (`package/` for `pnpm pack`). */
export const filesOf = async (tarball: Uint8Array<ArrayBuffer>): Promise<Map<string, Uint8Array>> => {
  const tar = await new Response(new Blob([tarball]).stream().pipeThrough(new DecompressionStream('gzip')))
    .arrayBuffer()
  const files = new Map<string, Uint8Array>()
  for (const entry of untar(tar)) {
    const slash = entry.filename.indexOf('/')
    if (slash === -1 || entry.filename.endsWith('/')) continue
    files.set(entry.filename.slice(slash + 1), entry.fileData)
  }
  return files
}

/** `<subpath>=<value>` pairs; a pair without `=` or with an empty side is refused. */
export const requirementsOf = (values: readonly string[]): Requirement[] | string =>
  values.reduce<Requirement[] | string>((acc, value) => {
    if (typeof acc === 'string') return acc
    const at = value.indexOf('=')
    if (at <= 0 || at === value.length - 1) return `expected <subpath>=<value>, got ${value}`
    return [...acc, { subpath: value.slice(0, at), value: value.slice(at + 1) }]
  }, [])

function fail(message: string): never {
  console.error(`pack-check: ${message}`)
  Deno.exit(1)
}

if (import.meta.main) {
  const args = parseArgs(Deno.args, {
    string: ['package-directory', 'forbid', 'require-export', 'require-literal'],
    collect: ['forbid', 'require-export', 'require-literal'],
    default: { 'package-directory': '.' },
  })
  if (args._.length > 0) fail(`unexpected argument ${args._[0]}`)
  const requireExport = requirementsOf(args['require-export'])
  if (typeof requireExport === 'string') fail(`--require-export: ${requireExport}`)
  const requireLiteral = requirementsOf(args['require-literal'])
  if (typeof requireLiteral === 'string') fail(`--require-literal: ${requireLiteral}`)

  const out = await Deno.makeTempDir({ prefix: 'pack-check-' })
  try {
    const packed = await new Deno.Command('pnpm', {
      args: ['pack', '--config.ignore-scripts=true', '--pack-destination', out],
      cwd: args['package-directory'],
      stdout: 'piped',
      stderr: 'piped',
    }).output()
    if (!packed.success) fail(`pnpm pack failed\n${new TextDecoder().decode(packed.stderr)}`)
    const tarballs = (await Array.fromAsync(Deno.readDir(out))).filter((entry) => entry.name.endsWith('.tgz'))
    if (tarballs.length !== 1) fail(`pnpm pack wrote ${tarballs.length} tarballs to ${out}, expected one`)
    const name = tarballs[0].name
    const judgement = await judge(
      await filesOf(await Deno.readFile(join(out, name))),
      { forbid: args.forbid, requireExport, requireLiteral },
      new Set(builtinModules),
    )
    if (judgement.kind === 'refused') fail(`${name}: ${judgement.reason}`)
    for (const finding of judgement.findings) console.log(`${name}: ${describe(finding)}`)
    if (judgement.findings.length > 0) Deno.exit(1)
    console.log(`${name}: no findings`)
  } finally {
    await Deno.remove(out, { recursive: true })
  }
}
