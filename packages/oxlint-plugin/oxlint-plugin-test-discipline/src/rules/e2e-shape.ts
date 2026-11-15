import type { ESTree } from '@oxlint/plugins'
import { Option, Schema as S } from 'effect'
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
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

const mtimeOf = (path: string): number => statSync(path).mtimeMs

const shapes = new Map<string, { readonly mtime: number; readonly shape: PackageShape }>()

const shapeAt = (root: string): PackageShape => {
  const manifestPath = join(root, 'package.json')
  const mtime = mtimeOf(manifestPath)
  const cached = shapes.get(root)
  if (cached !== undefined && cached.mtime === mtime) return cached.shape
  const manifest: typeof Manifest.Type = Option.getOrElse(
    S.decodeUnknownOption(S.fromJsonString(Manifest))(readFileSync(manifestPath, 'utf8')),
    () => ({}),
  )
  const shipsCode = manifest.exports !== undefined || manifest.main !== undefined ||
    manifest.module !== undefined || manifest.bin !== undefined || existsSync(join(root, 'src'))
  const shape = { root, name: manifest.name, shipsNothing: !shipsCode }
  shapes.set(root, { mtime, shape })
  return shape
}

export const packageOf = (filename: string): PackageShape | undefined => {
  for (let dir = dirname(filename);; dir = dirname(dir)) {
    if (existsSync(join(dir, 'package.json'))) return shapeAt(dir)
    if (dirname(dir) === dir) return undefined
  }
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

const isNode = (value: unknown): value is ESTree.Node =>
  typeof value === 'object' && value !== null && 'type' in value && typeof value.type === 'string'

const literalOf = (node: unknown): string | undefined =>
  isNode(node) && node.type === 'Literal' && typeof node.value === 'string' ? node.value : undefined

const isTypeOnlyImport = (node: ESTree.ImportDeclaration): boolean =>
  node.importKind === 'type' || (node.specifiers.length > 0 && node.specifiers.every(
    (specifier) => specifier.type === 'ImportSpecifier' && specifier.importKind === 'type',
  ))

const isRequireCall = (callee: ESTree.Node): boolean =>
  (callee.type === 'Identifier' && callee.name === 'require') ||
  (callee.type === 'CallExpression' && callee.callee.type === 'Identifier' &&
    callee.callee.name === 'createRequire')

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
    if (node.type === 'ImportDeclaration') {
      edges.push({ specifier: literalOf(node.source), typeOnly: isTypeOnlyImport(node) })
    } else if (node.type === 'ExportAllDeclaration' || (node.type === 'ExportNamedDeclaration' && node.source)) {
      edges.push({ specifier: literalOf(node.source), typeOnly: node.exportKind === 'type' })
    } else if (node.type === 'ImportExpression') {
      edges.push({ specifier: literalOf(node.source), typeOnly: false })
    } else if (node.type === 'CallExpression' && isRequireCall(node.callee)) {
      edges.push({ specifier: literalOf(node.arguments[0]), typeOnly: false })
    }
    for (const [key, child] of Object.entries(node)) {
      if (key !== 'parent' && typeof child === 'object' && child !== null) pending.push(child)
    }
  }
  return edges
}

const parsed = new Map<string, { readonly mtime: number; readonly edges: ReadonlyArray<Edge> }>()

const edgesOfFile = (file: string): ReadonlyArray<Edge> => {
  const mtime = mtimeOf(file)
  const cached = parsed.get(file)
  if (cached !== undefined && cached.mtime === mtime) return cached.edges
  const edges = edgesOf(parseSync(file, readFileSync(file, 'utf8')).program)
  parsed.set(file, { mtime, edges })
  return edges
}

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts']

const SOURCE_FILE = /\.[cm]?tsx?$/

const sourceFileOf = (target: string): string | undefined => {
  const stem = target.replace(/\.[cm]?jsx?$/, '')
  const candidates = [
    target,
    ...SOURCE_EXTENSIONS.map((extension) => `${stem}${extension}`),
    ...SOURCE_EXTENSIONS.map((extension) => join(target, `index${extension}`)),
  ]
  return candidates.find((candidate) =>
    SOURCE_FILE.test(candidate) && existsSync(candidate) && statSync(candidate).isFile()
  )
}

const packageNameOf = (specifier: string): string => {
  const parts = specifier.split('/')
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0] ?? specifier
}

const installedFromARegistry = (shape: PackageShape, name: string): boolean => {
  for (let dir = shape.root;; dir = dirname(dir)) {
    const installed = join(dir, 'node_modules', name)
    if (existsSync(installed)) return realpathSync(installed).split(sep).includes('node_modules')
    if (dirname(dir) === dir) return false
  }
}

const isOurs = (shape: PackageShape, specifier: string): boolean => {
  if (specifier.startsWith('node:')) return false
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

export const reachOf = (shape: PackageShape, filename: string, program: ESTree.Program): Reach | undefined => {
  const seen = new Set<string>([filename])
  const pending = [{ file: filename, edges: edgesOf(program) }]
  let typeReach: Reach | undefined
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    for (const edge of next.edges) {
      const found = reachOfEdge(shape, next.file, edge)
      if (found === 'local') {
        const local = edge.specifier === undefined
          ? undefined
          : sourceFileOf(resolve(dirname(next.file), edge.specifier))
        if (local !== undefined && !seen.has(local)) {
          seen.add(local)
          pending.push({ file: local, edges: edgesOfFile(local) })
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
