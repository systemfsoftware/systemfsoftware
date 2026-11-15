import type { ESTree } from '@oxlint/plugins'
import { Option, Schema as S } from 'effect'
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { parseSync } from 'oxc-parser'
import { isE2eTestFile } from './path.js'

const Manifest = S.Struct({
  name: S.optional(S.String),
  exports: S.optional(S.Unknown),
  main: S.optional(S.Unknown),
  module: S.optional(S.Unknown),
  bin: S.optional(S.Unknown),
})

interface Manifested {
  readonly root: string
  readonly name: string | undefined
  readonly shipsNothing: boolean
}

interface PackageShape extends Manifested {
  readonly endToEnd: boolean
}

const mtimeOf = (path: string): number => statSync(path).mtimeMs

const shapes = new Map<string, { readonly mtime: number; readonly shape: Manifested }>()

const manifestedAt = (root: string): Manifested => {
  const manifestPath = join(root, 'package.json')
  const mtime = mtimeOf(manifestPath)
  const cached = shapes.get(root)
  if (cached !== undefined && cached.mtime === mtime) return cached.shape
  const manifest: typeof Manifest.Type = Option.getOrElse(
    S.decodeUnknownOption(Manifest)(JSON.parse(readFileSync(manifestPath, 'utf8'))),
    () => ({}),
  )
  const shipsSomething = manifest.exports !== undefined || manifest.main !== undefined ||
    manifest.module !== undefined || manifest.bin !== undefined
  const shape = { root, name: manifest.name, shipsNothing: !shipsSomething && !existsSync(join(root, 'src')) }
  shapes.set(root, { mtime, shape })
  return shape
}

const holdsE2eTest = (root: string): boolean => {
  const testsDir = join(root, 'tests')
  if (!existsSync(testsDir)) return false
  return readdirSync(testsDir, { recursive: true, encoding: 'utf8' })
    .some((entry) => isE2eTestFile(join(testsDir, entry)))
}

const shapeAt = (root: string): PackageShape => {
  const manifested = manifestedAt(root)
  return { ...manifested, endToEnd: manifested.shipsNothing && holdsE2eTest(root) }
}

export const packageOf = (filename: string): PackageShape | undefined => {
  for (let dir = dirname(filename);; dir = dirname(dir)) {
    if (existsSync(join(dir, 'package.json'))) return shapeAt(dir)
    if (dirname(dir) === dir) return undefined
  }
}

export interface Reach {
  readonly specifier: string
  readonly file: string
  readonly node: ESTree.Node | undefined
}

interface Edge {
  readonly specifier: string | undefined
  readonly node: ESTree.Node | undefined
}

const isNode = (value: unknown): value is ESTree.Node =>
  typeof value === 'object' && value !== null && 'type' in value && typeof value.type === 'string'

const literalOf = (node: unknown): string | undefined =>
  isNode(node) && node.type === 'Literal' && typeof node.value === 'string' ? node.value : undefined

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
    if (
      node.type === 'ImportDeclaration' || node.type === 'ExportAllDeclaration' ||
      (node.type === 'ExportNamedDeclaration' && node.source !== null && node.source !== undefined)
    ) {
      edges.push({ specifier: literalOf(node.source), node })
    } else if (node.type === 'ImportExpression') {
      edges.push({ specifier: literalOf(node.source), node })
    } else if (
      node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 'require'
    ) {
      edges.push({ specifier: literalOf(node.arguments[0]), node })
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
  const { program } = parseSync(file, readFileSync(file, 'utf8'))
  const edges = edgesOf(program).map(({ specifier }) => ({ specifier, node: undefined }))
  parsed.set(file, { mtime, edges })
  return edges
}

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts']

const localFileOf = (from: string, specifier: string): string | undefined => {
  const base = resolve(dirname(from), specifier)
  const stem = base.replace(/\.[cm]?jsx?$/, '')
  const candidates = [
    base,
    ...SOURCE_EXTENSIONS.map((extension) => `${stem}${extension}`),
    ...SOURCE_EXTENSIONS.map((extension) => join(base, `index${extension}`)),
  ]
  return candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile())
}

const packageNameOf = (specifier: string): string => {
  const parts = specifier.split('/')
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0] ?? specifier
}

const namesOurPackage = (shape: PackageShape, specifier: string): boolean => {
  const name = packageNameOf(specifier)
  if (shape.name !== undefined && name === shape.name) return true
  for (let dir = shape.root;; dir = dirname(dir)) {
    const installed = join(dir, 'node_modules', name)
    if (existsSync(installed)) return !realpathSync(installed).split(sep).includes('node_modules')
    if (dirname(dir) === dir) return false
  }
}

const isInside = (dir: string, file: string): boolean => {
  const path = relative(dir, file)
  return path !== '' && !path.startsWith('..') && !path.startsWith(sep)
}

export const reachOf = (
  shape: PackageShape,
  filename: string,
  program: ESTree.Program,
): Reach | undefined => {
  const testsDir = join(shape.root, 'tests')
  const seen = new Set<string>([filename])
  const pending: Array<{ readonly file: string; readonly edges: ReadonlyArray<Edge>; readonly via: Edge | undefined }> =
    [
      { file: filename, edges: edgesOf(program), via: undefined },
    ]
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    for (const edge of next.edges) {
      const reported = next.via ?? edge
      const reach = { file: next.file, node: reported.node }
      if (edge.specifier === undefined) return { ...reach, specifier: '(computed)' }
      if (edge.specifier.startsWith('#')) return { ...reach, specifier: edge.specifier }
      if (edge.specifier.startsWith('.') || edge.specifier.startsWith('/')) {
        const local = localFileOf(next.file, edge.specifier)
        if (local === undefined || !isInside(testsDir, local)) return { ...reach, specifier: edge.specifier }
        if (!seen.has(local)) {
          seen.add(local)
          pending.push({ file: local, edges: edgesOfFile(local), via: reported })
        }
        continue
      }
      if (!edge.specifier.startsWith('node:') && namesOurPackage(shape, edge.specifier)) {
        return { ...reach, specifier: edge.specifier }
      }
    }
  }
  return undefined
}
