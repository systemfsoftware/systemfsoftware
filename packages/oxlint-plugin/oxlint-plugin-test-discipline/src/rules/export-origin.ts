import type { Declaration, ModuleExportName, Program } from '@oxc-project/types'
import { Option, Schema as S } from 'effect'
import { readFileSync, realpathSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { parseSync } from 'oxc-parser'

export type ExportOrigin =
  | { readonly _tag: 'Declared'; readonly file: string }
  | { readonly _tag: 'Namespace'; readonly file: string }
  | { readonly _tag: 'Unresolved'; readonly specifier: string }

const MAX_HOPS = 16

const isFile = (path: string): boolean => {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

const realPathOf = (path: string): string => {
  try {
    return realpathSync(path)
  } catch {
    return path
  }
}

const SCRIPT_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs'] as const

const candidatesOf = (path: string): readonly string[] => {
  const swapped = /\.[cm]?js$/.test(path)
    ? [path.replace(/\.([cm]?)js$/, '.$1ts'), `${path.slice(0, path.lastIndexOf('.'))}.tsx`]
    : []
  return [
    ...swapped,
    path,
    ...SCRIPT_EXTENSIONS.map((extension) => `${path}${extension}`),
    ...SCRIPT_EXTENSIONS.map((extension) => join(path, `index${extension}`)),
  ]
}

const fileAt = (path: string): string | undefined => {
  const found = candidatesOf(path).find(isFile)
  return found === undefined ? undefined : realPathOf(found)
}

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
})

type Manifest = typeof Manifest.Type

const manifestAt = (directory: string): Manifest | undefined => {
  const path = join(directory, 'package.json')
  if (!isFile(path)) return undefined
  return Option.getOrUndefined(S.decodeUnknownOption(S.fromJsonString(Manifest))(readFileSync(path, 'utf8')))
}

const entryOf = (root: string, manifest: Manifest, subpath: string): string | undefined => {
  const { exports } = manifest
  const keyed = isRecord(exports) && Object.keys(exports).some((key) => key.startsWith('.'))
  const exported = keyed ? targetOf(exports[subpath]) : subpath === '.' ? targetOf(exports) : undefined
  const relative = exported ?? (subpath === '.' ? manifest.module ?? manifest.main ?? 'index.js' : subpath)
  return fileAt(resolve(root, relative))
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
    const parent = dirname(directory)
    if (parent === directory) return undefined
    directory = parent
  }
}

export const moduleFileOf = (specifier: string, fromFile: string): string | undefined =>
  specifier.startsWith('.') || specifier.startsWith('/')
    ? fileAt(resolve(dirname(fromFile), specifier))
    : packageEntryOf(specifier, fromFile)

type Statement = Program['body'][number]

const nameOf = (node: ModuleExportName): string => node.type === 'Literal' ? String(node.value) : node.name

const declaresName = (declaration: Declaration, name: string): boolean => {
  if (declaration.type === 'VariableDeclaration') {
    return declaration.declarations.some((declarator) =>
      declarator.id.type === 'Identifier' && declarator.id.name === name
    )
  }
  return 'id' in declaration && declaration.id?.type === 'Identifier' && declaration.id.name === name
}

const programOf = (file: string): readonly Statement[] | undefined => {
  try {
    const body: readonly Statement[] = parseSync(file, readFileSync(file, 'utf8')).program.body
    return body
  } catch {
    return undefined
  }
}

const importedBindingOf = (
  body: readonly Statement[],
  local: string,
): { readonly source: string; readonly imported: string | undefined } | undefined => {
  for (const statement of body) {
    if (statement.type !== 'ImportDeclaration') continue
    for (const specifier of statement.specifiers) {
      if (specifier.local.name !== local) continue
      const imported = specifier.type === 'ImportSpecifier'
        ? nameOf(specifier.imported)
        : specifier.type === 'ImportDefaultSpecifier'
        ? 'default'
        : undefined
      return { source: statement.source.value, imported }
    }
  }
  return undefined
}

/**
 * Follows `name` exported from `file` through every re-export and import alias to the
 * file that declares it. A binding the walk cannot follow is reported as declared in the
 * last file it reached, so an unreadable chain never passes as a workflow.
 */
export const originOfExport = (
  file: string,
  name: string,
  hops = 0,
  seen: ReadonlySet<string> = new Set(),
): ExportOrigin => {
  const key = `${file}#${name}`
  if (hops > MAX_HOPS || seen.has(key)) return { _tag: 'Declared', file }
  const next = new Set(seen).add(key)
  const body = programOf(file)
  if (body === undefined) return { _tag: 'Declared', file }
  const follow = (specifier: string, imported: string | undefined): ExportOrigin => {
    const target = moduleFileOf(specifier, file)
    if (target === undefined) return { _tag: 'Unresolved', specifier }
    return imported === undefined
      ? { _tag: 'Namespace', file: target }
      : originOfExport(target, imported, hops + 1, next)
  }
  for (const statement of body) {
    if (statement.type === 'ExportNamedDeclaration') {
      if (statement.declaration != null && declaresName(statement.declaration, name)) return { _tag: 'Declared', file }
      for (const specifier of statement.specifiers ?? []) {
        if (nameOf(specifier.exported) !== name) continue
        const local = nameOf(specifier.local)
        if (statement.source != null) return follow(statement.source.value, local)
        const binding = importedBindingOf(body, local)
        return binding === undefined ? { _tag: 'Declared', file } : follow(binding.source, binding.imported)
      }
    }
    if (
      statement.type === 'ExportAllDeclaration' && statement.source != null && statement.exported != null &&
      nameOf(statement.exported) === name
    ) return follow(statement.source.value, undefined)
  }
  for (const statement of body) {
    if (statement.type !== 'ExportAllDeclaration' || statement.source == null || statement.exported != null) continue
    const target = moduleFileOf(statement.source.value, file)
    if (target === undefined) continue
    const origin = originOfExport(target, name, hops + 1, next)
    if (origin._tag !== 'Declared' || origin.file !== target || exportsName(target, name)) return origin
  }
  return { _tag: 'Declared', file }
}

const exportsName = (file: string, name: string): boolean =>
  (programOf(file) ?? []).some((statement) =>
    statement.type === 'ExportNamedDeclaration' &&
    (statement.declaration != null && declaresName(statement.declaration, name) ||
      (statement.specifiers ?? []).some((specifier) => nameOf(specifier.exported) === name))
  )
