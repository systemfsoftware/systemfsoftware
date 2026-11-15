import type { ESTree } from '@oxlint/plugins'
import { Option, Schema as S } from 'effect'
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { isBuiltin } from 'node:module'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { parseSync } from 'oxc-parser'

const Manifest = S.Struct({
  name: S.optional(S.String),
  exports: S.optional(S.Unknown),
  main: S.optional(S.Unknown),
  module: S.optional(S.Unknown),
  bin: S.optional(S.Unknown),
})

export interface PackageShape {
  readonly root: string
  readonly name: string | undefined
  readonly shipsNothing: boolean
}

const attempt = <A>(read: () => A): Option.Option<A> => {
  try {
    return Option.some(read())
  } catch {
    return Option.none()
  }
}

const mtimeOf = (path: string): number | undefined => Option.getOrUndefined(attempt(() => statSync(path).mtimeMs))

const exportsSomething = (exports: unknown): boolean =>
  exports !== undefined && exports !== null && exports !== '' &&
  !(typeof exports === 'object' && Object.keys(exports).length === 0)

const shapes = new Map<string, { readonly mtime: number | undefined; readonly shape: PackageShape }>()

const shapeAt = (root: string): PackageShape => {
  const manifestPath = join(root, 'package.json')
  const mtime = mtimeOf(manifestPath)
  const cached = shapes.get(root)
  if (cached !== undefined && mtime !== undefined && cached.mtime === mtime) return cached.shape
  const manifest: typeof Manifest.Type = Option.getOrElse(
    Option.flatMap(
      attempt(() => readFileSync(manifestPath, 'utf8')),
      S.decodeUnknownOption(S.fromJsonString(Manifest)),
    ),
    () => ({}),
  )
  const shipsCode = exportsSomething(manifest.exports) || manifest.main !== undefined ||
    manifest.module !== undefined || manifest.bin !== undefined || existsSync(join(root, 'src'))
  const shape = { root, name: manifest.name, shipsNothing: !shipsCode }
  shapes.set(root, { mtime, shape })
  return shape
}

const manifestDirsAbove = (filename: string): ReadonlyArray<string> => {
  const dirs: string[] = []
  for (let dir = dirname(filename);; dir = dirname(dir)) {
    if (existsSync(join(dir, 'package.json'))) dirs.push(dir)
    if (dirname(dir) === dir) return dirs
  }
}

export const packageOf = (filename: string): PackageShape | undefined => {
  const [innermost, ...outer] = manifestDirsAbove(filename)
  if (innermost === undefined) return undefined
  let root = innermost
  for (const dir of outer) {
    if (relative(dir, root).split(sep)[0] !== 'tests') break
    root = dir
  }
  return shapeAt(root)
}

type ReachKind = 'value' | 'type'

export interface Reach {
  readonly kind: ReachKind
  readonly specifier: string
  readonly file: string
}

interface Edge {
  readonly specifier: string | undefined
  readonly typeOnly: boolean
}

export const isNode = (value: unknown): value is ESTree.Node =>
  typeof value === 'object' && value !== null && 'type' in value && typeof value.type === 'string'

const literalOf = (node: unknown): string | undefined =>
  isNode(node) && node.type === 'Literal' && typeof node.value === 'string' ? node.value : undefined

export const isTypeOnly = (node: ESTree.ImportDeclaration): boolean =>
  node.importKind === 'type' || (node.specifiers.length > 0 && node.specifiers.every(
    (specifier) => specifier.type === 'ImportSpecifier' && specifier.importKind === 'type',
  ))

const MODULE_LOADERS = new Set(['module', 'node:module'])

const LOADER_NAMES = new Set(['createRequire', 'getBuiltinModule'])

const nameOf = (node: ESTree.Node): string | undefined =>
  node.type === 'Identifier'
    ? node.name
    : node.type !== 'MemberExpression'
    ? undefined
    : node.property.type === 'Identifier' && !node.computed
    ? node.property.name
    : literalOf(node.property)

const importedNameOf = (specifier: ESTree.ImportSpecifier): string | undefined =>
  specifier.imported.type === 'Identifier' ? specifier.imported.name : literalOf(specifier.imported)

const TYPE_POSITIONS =
  /^TS(?!AsExpression$|SatisfiesExpression$|NonNullExpression$|TypeAssertion$|InstantiationExpression$|ExportAssignment$|EnumDeclaration$|ModuleDeclaration$|ImportEqualsDeclaration$|ExternalModuleReference$|ParameterProperty$)/

const importsALoader = (node: ESTree.ImportDeclaration): boolean =>
  !isTypeOnly(node) && MODULE_LOADERS.has(node.source.value) &&
  node.specifiers.some((specifier) =>
    specifier.type !== 'ImportSpecifier' ||
    (specifier.importKind !== 'type' && importedNameOf(specifier) === 'createRequire')
  )

const edgesOf = (program: unknown): ReadonlyArray<Edge> => {
  const edges: Edge[] = []
  const pending: unknown[] = [program]
  while (pending.length > 0) {
    const node = pending.pop()
    if (Array.isArray(node)) {
      pending.push(...node)
      continue
    }
    if (!isNode(node)) continue
    if (node.type === 'ImportSpecifier' && node.importKind === 'type') continue
    if (TYPE_POSITIONS.test(node.type)) continue
    if (node.type === 'Identifier' && LOADER_NAMES.has(node.name)) edges.push({ specifier: undefined, typeOnly: false })
    if (node.type === 'ImportDeclaration') {
      edges.push(
        importsALoader(node)
          ? { specifier: undefined, typeOnly: false }
          : { specifier: literalOf(node.source), typeOnly: isTypeOnly(node) },
      )
      if (isTypeOnly(node)) continue
    } else if (node.type === 'ExportAllDeclaration' || (node.type === 'ExportNamedDeclaration' && node.source)) {
      edges.push({ specifier: literalOf(node.source), typeOnly: node.exportKind === 'type' })
    } else if (node.type === 'ImportExpression') {
      const specifier = literalOf(node.source)
      edges.push({
        specifier: specifier !== undefined && MODULE_LOADERS.has(specifier) ? undefined : specifier,
        typeOnly: false,
      })
    } else if (node.type === 'CallExpression') {
      if (nameOf(node.callee) === 'require') edges.push({ specifier: literalOf(node.arguments[0]), typeOnly: false })
    } else if (node.type === 'MemberExpression') {
      const name = nameOf(node)
      if (name !== undefined && LOADER_NAMES.has(name)) edges.push({ specifier: undefined, typeOnly: false })
    }
    for (const [key, child] of Object.entries(node)) {
      if (key !== 'parent' && typeof child === 'object' && child !== null) pending.push(child)
    }
  }
  return edges
}

const UNREADABLE: ReadonlyArray<Edge> = [{ specifier: undefined, typeOnly: false }]

const parsed = new Map<string, { readonly mtime: number; readonly edges: ReadonlyArray<Edge> }>()

const edgesOfFile = (file: string): ReadonlyArray<Edge> => {
  const mtime = mtimeOf(file)
  if (mtime === undefined) return UNREADABLE
  const cached = parsed.get(file)
  if (cached !== undefined && cached.mtime === mtime) return cached.edges
  const edges = Option.getOrElse(
    attempt(() => edgesOf(parseSync(file, readFileSync(file, 'utf8')).program)),
    () => UNREADABLE,
  )
  parsed.set(file, { mtime, edges })
  return edges
}

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']

const SOURCE_FILE = /\.[cm]?[jt]sx?$/

const isFile = (path: string): boolean => Option.getOrElse(attempt(() => statSync(path).isFile()), () => false)

const sourceFileOf = (target: string): string | undefined => {
  const stem = target.replace(/\.[cm]?jsx?$/, '')
  const candidates = [
    target,
    ...SOURCE_EXTENSIONS.map((extension) => `${stem}${extension}`),
    ...SOURCE_EXTENSIONS.map((extension) => join(target, `index${extension}`)),
  ]
  return candidates.find((candidate) => SOURCE_FILE.test(candidate) && isFile(candidate))
}

const packageNameOf = (specifier: string): string => {
  const parts = specifier.split('/')
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0] ?? specifier
}

const installedFromARegistry = (shape: PackageShape, name: string): boolean => {
  for (let dir = shape.root;; dir = dirname(dir)) {
    const installed = join(dir, 'node_modules', name)
    if (existsSync(installed)) {
      return Option.exists(
        attempt(() => realpathSync(installed)),
        (target) => relative(dir, target).split(sep).includes('node_modules'),
      )
    }
    if (dirname(dir) === dir) return false
  }
}

const isOurs = (shape: PackageShape, specifier: string): boolean => {
  if (isBuiltin(specifier)) return false
  const name = packageNameOf(specifier)
  if (name === shape.name) return true
  return !installedFromARegistry(shape, name)
}

const isInside = (dir: string, file: string): boolean => {
  const path = relative(dir, file)
  return path !== '' && !path.startsWith('..') && !path.startsWith(sep)
}

const reachOfEdge = (shape: PackageShape, file: string, edge: Edge): Reach | 'local' | undefined => {
  const reach = (specifier: string): Reach => ({ kind: edge.typeOnly ? 'type' : 'value', specifier, file })
  const specifier = edge.specifier
  if (specifier === undefined) return reach('(computed)')
  if (specifier.startsWith('#')) return reach(specifier)
  if (specifier.startsWith('.') || specifier.startsWith('/')) {
    return isInside(join(shape.root, 'tests'), resolve(dirname(file), specifier)) ? 'local' : reach(specifier)
  }
  return isOurs(shape, specifier) ? reach(specifier) : undefined
}

const realOf = (path: string): string | undefined => Option.getOrUndefined(attempt(() => realpathSync(path)))

const staysInTests = (shape: PackageShape, file: string): boolean => {
  const tests = realOf(join(shape.root, 'tests'))
  const target = realOf(file)
  return tests !== undefined && target !== undefined && isInside(tests, target)
}

export const reachOf = (shape: PackageShape, filename: string, program: ESTree.Program): Reach | undefined => {
  const seen = new Map<string, boolean>([[filename, false]])
  const pending = [{ file: filename, edges: edgesOf(program), typeOnly: false }]
  let typeReach: Reach | undefined
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    for (const raw of next.edges) {
      const edge = next.typeOnly ? { ...raw, typeOnly: true } : raw
      const found = reachOfEdge(shape, next.file, edge)
      if (found === 'local') {
        const local = edge.specifier === undefined
          ? undefined
          : sourceFileOf(resolve(dirname(next.file), edge.specifier))
        const walkedAsType = local === undefined ? undefined : seen.get(local)
        if (local !== undefined && (walkedAsType === undefined || (walkedAsType && !edge.typeOnly))) {
          seen.set(local, edge.typeOnly)
          if (!staysInTests(shape, local)) {
            return { kind: edge.typeOnly ? 'type' : 'value', specifier: edge.specifier ?? local, file: next.file }
          }
          pending.push({ file: local, edges: edgesOfFile(local), typeOnly: edge.typeOnly })
        }
      } else if (found?.kind === 'value') {
        return found
      } else {
        typeReach ??= found
      }
    }
  }
  return typeReach
}
