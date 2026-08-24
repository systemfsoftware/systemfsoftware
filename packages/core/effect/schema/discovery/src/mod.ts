import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, extname, join, resolve } from 'node:path'
import { parseSync } from 'oxc-parser'
import { findExportedSchemaNames } from './internal/schema-names.js'

/**
 * @since 0.1.0
 */
export interface FoundSchema {
  name: string
  /** Absolute path of the file declaring the schema. */
  filePath: string
}

/**
 * A schema is identified by the module that declares it *and* its exported
 * name — never the name alone. Two files may export the same name, and every
 * name-keyed decision (import binding, law title, refutation coverage) then
 * conflates them.
 *
 * The path is resolved because the two sides reach it differently: a walk
 * joins the caller's `srcDir`, which may be relative, while an import is
 * resolved against the importing file and is always absolute.
 *
 * @since 0.1.0
 */
export const identityOf = (filePath: string, name: string): string => `${resolve(filePath)}#${name}`

/**
 * A single-quoted TypeScript literal. Every quoted value the suite emits is
 * built from a filesystem path, and a path may legally hold a quote or a
 * backslash — unescaped, either ends the literal early and leaves the whole
 * generated file unparseable, so no law in the package runs at all.
 *
 * @since 0.1.0
 */
export const quote = (value: string): string => `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`

/**
 * Walk a directory and return every exported const whose type annotation
 * or initialiser references Effect Schema APIs.
 *
 * @since 0.1.0
 */
export function findExportedSchemas(dir: string): FoundSchema[] {
  const schemas: FoundSchema[] = []

  function walk(current: string): void {
    let entries: string[]
    try {
      entries = readdirSync(current)
    } catch {
      return
    }
    for (const entry of entries) {
      const full = join(current, entry)
      let stat: ReturnType<typeof statSync>
      try {
        stat = statSync(full)
      } catch {
        continue
      }
      if (stat.isDirectory()) {
        if (entry === '__tests__' || entry === 'node_modules' || entry === '.git') continue
        walk(full)
      } else if (
        stat.isFile() && extname(entry) === '.ts' && !entry.endsWith('.test.ts') && !entry.endsWith('.spec.ts')
      ) {
        const source = readFileSync(full, 'utf-8')
        const names = findExportedSchemaNames(source)
        for (const name of names) {
          schemas.push({ name, filePath: full })
        }
      }
    }
  }

  walk(dir)
  return schemas
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

const identifierName = (value: unknown): string | undefined => {
  if (!isRecord(value)) return undefined
  return value['type'] === 'Identifier' && typeof value['name'] === 'string' ? value['name'] : undefined
}

function findRefutesCallSites(source: string): string[] {
  try {
    const names: string[] = []
    const visit = (node: unknown): void => {
      if (Array.isArray(node)) {
        for (const child of node) visit(child)
        return
      }
      if (!isRecord(node)) return
      if (node['type'] === 'CallExpression' && identifierName(node['callee']) === 'refutes') {
        const args = node['arguments']
        const first = Array.isArray(args) ? identifierName(args[0]) : undefined
        if (first !== undefined) names.push(first)
      }
      for (const value of Object.values(node)) visit(value)
    }
    visit(parseSync('temp.ts', source).program.body)
    return names
  } catch {
    return []
  }
}

const MODULE_EXTENSION = /\.(?:m|c)?[jt]sx?$/

const resolveLocalModule = (fromFile: string, specifier: string): string | undefined => {
  if (!specifier.startsWith('.')) return undefined
  const base = resolve(dirname(fromFile), specifier.replace(MODULE_EXTENSION, ''))
  return [`${base}.ts`, join(base, 'index.ts')].find((candidate) => existsSync(candidate))
}

/**
 * Every name a `refutes` call site could be holding, mapped to the identity
 * of the schema it denotes — or to `undefined` when the name is imported but
 * the declaring module could not be pinned. Presence therefore means "came
 * from an import", which is what licenses the by-name fallback below; a name
 * absent from this map was declared in the file itself.
 */
const importedBindings = (filePath: string, source: string): ReadonlyMap<string, string | undefined> => {
  const bindings = new Map<string, string | undefined>()
  try {
    for (const node of parseSync('temp.ts', source).program.body) {
      if (node.type !== 'ImportDeclaration') continue
      const declaring = resolveLocalModule(filePath, node.source.value)
      for (const spec of node.specifiers ?? []) {
        if (spec.type === 'ImportDefaultSpecifier' || spec.type === 'ImportNamespaceSpecifier') {
          bindings.set(spec.local.name, undefined)
          continue
        }
        if (spec.type !== 'ImportSpecifier') continue
        if (spec.imported.type !== 'Identifier') continue
        bindings.set(
          spec.local.name,
          declaring === undefined ? undefined : identityOf(declaring, spec.imported.name),
        )
      }
    }
  } catch {
    return bindings
  }
  return bindings
}

/**
 * Identities of the schemas some `refutes` call discharges.
 *
 * A call site resolves exactly when its import pins a module that declares
 * one of `schemas`. When it does not — a barrel re-export, a default import,
 * an unresolvable specifier — the name is matched against `schemas` instead,
 * but only while exactly one schema bears it. An ambiguous name is left
 * undischarged rather than guessed, which is the whole point: guessing is
 * how a refusal stated against one module came to cover its namesake.
 *
 * @since 0.1.0
 */
export function findRefutedIdentities(dir: string, schemas: readonly FoundSchema[]): ReadonlySet<string> {
  const declared = new Set(schemas.map((s) => identityOf(s.filePath, s.name)))
  const byName = new Map<string, string | undefined>()
  for (const s of schemas) {
    const identity = identityOf(s.filePath, s.name)
    byName.set(s.name, byName.has(s.name) ? undefined : identity)
  }

  const refuted = new Set<string>()
  const walk = (current: string): void => {
    let entries: string[]
    try {
      entries = readdirSync(current)
    } catch {
      return
    }
    for (const entry of entries) {
      const full = join(current, entry)
      let stat: ReturnType<typeof statSync>
      try {
        stat = statSync(full)
      } catch {
        continue
      }
      if (stat.isDirectory()) {
        if (entry === 'node_modules' || entry === '.git') continue
        walk(full)
      } else if (stat.isFile() && extname(entry) === '.ts') {
        const source = readFileSync(full, 'utf-8')
        const sites = findRefutesCallSites(source)
        if (sites.length === 0) continue
        const bindings = importedBindings(full, source)
        for (const name of sites) {
          const bound = bindings.get(name)
          if (bound !== undefined && declared.has(bound)) refuted.add(bound)
          else if (!bindings.has(name)) refuted.add(identityOf(full, name))
          else {
            const sole = byName.get(name)
            if (sole !== undefined) refuted.add(sole)
          }
        }
      }
    }
  }
  walk(dir)
  return refuted
}
