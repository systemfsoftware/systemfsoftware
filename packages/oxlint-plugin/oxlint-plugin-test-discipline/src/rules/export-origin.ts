import type { Declaration, ModuleExportName, Program } from '@oxc-project/types'
import { Option, Schema as S } from 'effect'
import { readFileSync, realpathSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { parseSync } from 'oxc-parser'

export type ExportOrigin =
  | { readonly _tag: 'Declared'; readonly file: string }
  | { readonly _tag: 'Namespace'; readonly file: string }
  | { readonly _tag: 'Untraceable'; readonly file: string }
  | { readonly _tag: 'Unresolved'; readonly specifier: string }

const MAX_HOPS = 16

const memo = <A>(compute: (key: string) => A): (key: string) => A => {
  const cache = new Map<string, { readonly value: A }>()
  return (key) => {
    const hit = cache.get(key)
    if (hit !== undefined) return hit.value
    const value = compute(key)
    cache.set(key, { value })
    return value
  }
}

const isFile = memo((path: string): boolean => {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
})

const realPathOf = (path: string): string => {
  try {
    return realpathSync(path)
  } catch {
    return path
  }
}

const SCRIPT_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.d.ts', '.d.mts', '.d.cts', '.js', '.mjs', '.cjs'] as const

const swapsOf = (path: string): readonly string[] => {
  const match = /^(.*)\.([cm]?)js$/.exec(path)
  if (match === null) return []
  const [, stem, flavour] = match
  return [`${stem}.${flavour}ts`, `${stem}.tsx`, `${stem}.d.${flavour}ts`]
}

const candidatesOf = (path: string): readonly string[] => [
  ...swapsOf(path),
  path,
  ...SCRIPT_EXTENSIONS.map((extension) => `${path}${extension}`),
  ...SCRIPT_EXTENSIONS.map((extension) => join(path, `index${extension}`)),
]

const fileAt = memo((path: string): string | undefined => {
  const found = candidatesOf(path).find(isFile)
  return found === undefined ? undefined : realPathOf(found)
})

const packageNameOf = (specifier: string): { readonly name: string; readonly subpath: string } => {
  const parts = specifier.split('/')
  const size = specifier.startsWith('@') ? 2 : 1
  const rest = parts.slice(size).join('/')
  return { name: parts.slice(0, size).join('/'), subpath: rest === '' ? '.' : `./${rest}` }
}

const CONDITIONS = ['source', 'import', 'module', 'default', 'types', 'require'] as const

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const targetOf = (target: unknown): string | undefined => {
  if (typeof target === 'string') return target
  if (Array.isArray(target)) {
    for (const item of target) {
      const found = targetOf(item)
      if (found !== undefined) return found
    }
    return undefined
  }
  if (!isRecord(target)) return undefined
  for (const condition of CONDITIONS) {
    const found = targetOf(target[condition])
    if (found !== undefined) return found
  }
  return undefined
}

const Manifest = S.Struct({
  name: S.optional(S.String),
  exports: S.optional(S.Unknown),
  module: S.optional(S.String),
  main: S.optional(S.String),
  types: S.optional(S.String),
  typings: S.optional(S.String),
})

type Manifest = typeof Manifest.Type

const manifestAt = memo((directory: string): Manifest | undefined => {
  const path = join(directory, 'package.json')
  if (!isFile(path)) return undefined
  return Option.getOrUndefined(S.decodeUnknownOption(S.fromJsonString(Manifest))(readFileSync(path, 'utf8')))
})

type PatternMatch = {
  readonly target: unknown
  readonly stem: string
  readonly prefix: number
  readonly suffix: number
}

const patternMatchOf = (exports: Readonly<Record<string, unknown>>, subpath: string): PatternMatch | undefined => {
  const matches: PatternMatch[] = []
  for (const [key, value] of Object.entries(exports)) {
    const star = key.indexOf('*')
    if (star < 0) continue
    const prefix = key.slice(0, star)
    const suffix = key.slice(star + 1)
    if (!subpath.startsWith(prefix) || !subpath.endsWith(suffix) || subpath.length < key.length - 1) continue
    matches.push({
      target: value,
      stem: subpath.slice(prefix.length, subpath.length - suffix.length),
      prefix: prefix.length,
      suffix: suffix.length,
    })
  }
  matches.sort((left, right) => right.prefix - left.prefix || right.suffix - left.suffix)
  return matches[0]
}

const entryOf = (root: string, manifest: Manifest, subpath: string): string | undefined => {
  const { exports } = manifest
  const keyed = isRecord(exports) && Object.keys(exports).some((key) => key.startsWith('.'))
  if (keyed && subpath in exports && exports[subpath] === null) return undefined
  const pattern = keyed && !(subpath in exports) ? patternMatchOf(exports, subpath) : undefined
  if (pattern !== undefined && pattern.target === null) return undefined
  const exported = keyed
    ? (pattern === undefined
      ? targetOf(exports[subpath])
      : targetOf(pattern.target)?.replaceAll('*', pattern.stem))
    : subpath === '.'
    ? targetOf(exports)
    : undefined
  const fallbacks = subpath === '.'
    ? [manifest.module, manifest.main, manifest.types, manifest.typings, 'index.js']
    : keyed
    ? []
    : [subpath]
  for (const relative of [exported, ...fallbacks]) {
    if (relative === undefined) continue
    const file = fileAt(resolve(root, relative))
    if (file !== undefined) return file
  }
  return undefined
}

const packageEntryOf = (specifier: string, fromFile: string): string | undefined => {
  const { name, subpath } = packageNameOf(specifier)
  let directory = dirname(fromFile)
  for (;;) {
    const own = manifestAt(directory)
    if (own?.name === name) return entryOf(directory, own, subpath)
    const installed = join(directory, 'node_modules', name)
    const manifest = manifestAt(installed)
    if (manifest !== undefined) return entryOf(realPathOf(installed), manifest, subpath)
    const linked = fileAt(join(installed, subpath))
    if (linked !== undefined) return linked
    const parent = dirname(directory)
    if (parent === directory) return undefined
    directory = parent
  }
}

export const moduleFileOf = (specifier: string, fromFile: string): string | undefined => {
  const from = realPathOf(fromFile)
  return specifier.startsWith('.') || specifier.startsWith('/')
    ? fileAt(resolve(dirname(from), specifier))
    : packageEntryOf(specifier, from)
}

type Statement = Program['body'][number]

const nameOf = (node: ModuleExportName): string => node.type === 'Literal' ? String(node.value) : node.name

const programOf = memo((file: string): readonly Statement[] | undefined => {
  try {
    const parsed = parseSync(file, readFileSync(file, 'utf8'))
    if (parsed.errors.length > 0) return undefined
    const body: readonly Statement[] = parsed.program.body
    return body
  } catch {
    return undefined
  }
})

type LocalBinding =
  | { readonly _tag: 'Import'; readonly source: string; readonly imported: string | undefined }
  | { readonly _tag: 'Alias'; readonly name: string }
  | { readonly _tag: 'Own' }
  | { readonly _tag: 'None' }

const bindingInDeclaration = (declaration: Declaration, local: string): LocalBinding => {
  if (declaration.type === 'VariableDeclaration') {
    for (const declarator of declaration.declarations) {
      if (declarator.id.type !== 'Identifier' || declarator.id.name !== local) continue
      if (declaration.kind !== 'const') return { _tag: 'None' }
      return declarator.init?.type === 'Identifier' ? { _tag: 'Alias', name: declarator.init.name } : { _tag: 'Own' }
    }
    return { _tag: 'None' }
  }
  return 'id' in declaration && declaration.id?.type === 'Identifier' && declaration.id.name === local
    ? { _tag: 'Own' }
    : { _tag: 'None' }
}

const localBindingOf = (body: readonly Statement[], local: string): LocalBinding => {
  for (const statement of body) {
    if (statement.type === 'ImportDeclaration') {
      for (const specifier of statement.specifiers) {
        if (specifier.local.name !== local) continue
        const imported = specifier.type === 'ImportSpecifier'
          ? nameOf(specifier.imported)
          : specifier.type === 'ImportDefaultSpecifier'
          ? 'default'
          : undefined
        return { _tag: 'Import', source: statement.source.value, imported }
      }
      continue
    }
    const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement
    if (declaration === null || declaration === undefined) continue
    if (
      declaration.type !== 'VariableDeclaration' && declaration.type !== 'FunctionDeclaration' &&
      declaration.type !== 'ClassDeclaration'
    ) continue
    const binding = bindingInDeclaration(declaration, local)
    if (binding._tag !== 'None') return binding
  }
  return { _tag: 'None' }
}

/**
 * Follows `name` exported from `file` through re-exports, imports and const aliases to
 * the file that declares it. Anything the walk cannot follow is Untraceable, never Declared,
 * so an unreadable chain cannot pass as declared in a workflow file.
 */
export const originOfExport = (
  file: string,
  name: string,
  hops = 0,
  seen: ReadonlySet<string> = new Set(),
): ExportOrigin => {
  const key = `${file}#${name}`
  if (hops > MAX_HOPS || seen.has(key)) return { _tag: 'Untraceable', file }
  const next = new Set(seen).add(key)
  const body = programOf(file)
  if (body === undefined) return { _tag: 'Untraceable', file }

  const follow = (specifier: string, imported: string | undefined): ExportOrigin => {
    const target = moduleFileOf(specifier, file)
    if (target === undefined) return { _tag: 'Unresolved', specifier }
    return imported === undefined
      ? { _tag: 'Namespace', file: target }
      : originOfExport(target, imported, hops + 1, next)
  }

  const originOfLocal = (local: string, depth = 0): ExportOrigin => {
    const binding = depth > MAX_HOPS ? { _tag: 'None' as const } : localBindingOf(body, local)
    if (binding._tag === 'Import') return follow(binding.source, binding.imported)
    if (binding._tag === 'Alias') return originOfLocal(binding.name, depth + 1)
    if (binding._tag === 'Own') return { _tag: 'Declared', file }
    return { _tag: 'Untraceable', file }
  }

  for (const statement of body) {
    if (statement.type === 'ExportNamedDeclaration') {
      const declaration = statement.declaration
      if (
        declaration !== null && declaration !== undefined &&
        bindingInDeclaration(declaration, name)._tag !== 'None'
      ) return originOfLocal(name)
      for (const specifier of statement.specifiers) {
        if (nameOf(specifier.exported) !== name) continue
        const local = nameOf(specifier.local)
        return statement.source !== null && statement.source !== undefined
          ? follow(statement.source.value, local)
          : originOfLocal(local)
      }
    }
    if (statement.type === 'ExportDefaultDeclaration' && name === 'default') {
      const declaration = statement.declaration
      return declaration.type === 'Identifier' ? originOfLocal(declaration.name) : { _tag: 'Declared', file }
    }
    if (
      statement.type === 'ExportAllDeclaration' && statement.exported !== null && nameOf(statement.exported) === name
    ) return follow(statement.source.value, undefined)
  }
  for (const statement of body) {
    if (statement.type !== 'ExportAllDeclaration' || statement.exported !== null) continue
    const target = moduleFileOf(statement.source.value, file)
    if (target === undefined) continue
    const origin = originOfExport(target, name, hops + 1, next)
    if (origin._tag !== 'Untraceable') return origin
  }
  return { _tag: 'Untraceable', file }
}
