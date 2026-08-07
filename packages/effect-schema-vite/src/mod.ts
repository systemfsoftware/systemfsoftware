import type { Expression, MemberExpression, TSType } from '@oxc-project/types'
import type { Dirent } from 'node:fs'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { parseSync } from 'oxc-parser'
import type { Plugin, ResolvedConfig } from 'vite'

/** @since 0.1.0 */
export interface InlineSchemaTestsOptions {
  /** Directory to scan for schema files, relative to Vite root. Default: `"src"`. */
  dir?: string
}

/**
 * The one test filename the placement taxonomy whitelists by name. The plugin
 * rewrites this file in the consumer's `src/`; nothing else is touched.
 *
 * @since 1.4.0
 */
export const LAW_FILE_BASENAME = 'schema-laws.test.ts' as const

interface FoundSchema {
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
 */
const identityOf = (filePath: string, name: string): string => `${resolve(filePath)}#${name}`

/**
 * A single-quoted TypeScript literal. Every quoted value the suite emits is
 * built from a filesystem path, and a path may legally hold a quote or a
 * backslash — unescaped, either ends the literal early and leaves the whole
 * generated file unparseable, so no law in the package runs at all.
 */
const quote = (value: string): string => `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`

/**
 * Walk a directory and return every exported const whose type annotation
 * or initialiser references Effect Schema APIs.
 */
function findExportedSchemas(dir: string): FoundSchema[] {
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

function findExportedSchemaNames(source: string): string[] {
  try {
    const result = parseSync('temp.ts', source)

    const names: string[] = []

    for (const node of result.program.body) {
      if (node.type !== 'ExportNamedDeclaration') continue
      const decl = node.declaration
      if (!decl) continue

      if (decl.type === 'ClassDeclaration') {
        const className = decl.id?.name
        if (
          typeof className === 'string' && !className.startsWith('_') &&
          extendsSchemaClass(decl.superClass)
        ) {
          names.push(className)
        }
        continue
      }

      if (decl.type !== 'VariableDeclaration') continue

      for (const declarator of decl.declarations) {
        const id = declarator.id
        if (id.type !== 'Identifier') continue
        const name = id.name
        if (name.startsWith('_')) continue

        let isSchema = false

        // Check 1: type annotation contains "Schema"
        if (id.typeAnnotation?.typeAnnotation) {
          isSchema = typeRefContainsSchema(id.typeAnnotation.typeAnnotation)
        }

        // Check 2: init is a pipe() call or S. member chain
        if (!isSchema && declarator.init) {
          isSchema = initRefersToSchema(declarator.init)
        }

        if (isSchema) names.push(name)
      }
    }

    return names
  } catch {
    return []
  }
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
 */
function findRefutedIdentities(dir: string, schemas: readonly FoundSchema[]): ReadonlySet<string> {
  const declared = new Set(schemas.map((s) => identityOf(s.filePath, s.name)))
  const byName = new Map<string, string | undefined>()
  for (const s of schemas) {
    const identity = identityOf(s.filePath, s.name)
    byName.set(s.name, byName.has(s.name) ? undefined : identity)
  }

  const refuted = new Set<string>()
  const walk = (current: string): void => {
    let entries: ReadonlyArray<Dirent>
    try {
      entries = readdirSync(current, { withFileTypes: true })
    } catch {
      return
    }
    for (const dirent of entries) {
      const full = join(current, dirent.name)
      if (dirent.isDirectory()) {
        if (dirent.name === 'node_modules' || dirent.name === '.git') continue
        walk(full)
      } else if (dirent.isFile() && extname(dirent.name) === '.ts') {
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

function typeRefContainsSchema(t: TSType | null | undefined): boolean {
  if (!t) return false

  if (t.type === 'TSTypeReference' && t.typeName.type === 'Identifier') {
    return t.typeName.name.includes('Schema')
  }

  if (t.type === 'TSUnionType' || t.type === 'TSIntersectionType') {
    return t.types.some((member) => typeRefContainsSchema(member))
  }

  return false
}

function initRefersToSchema(expr: Expression | null | undefined): boolean {
  if (!expr) return false

  if (expr.type === 'CallExpression') {
    const callee = expr.callee

    if (callee.type === 'Identifier' && callee.name === 'pipe') {
      return expr.arguments.some((arg) => arg.type !== 'SpreadElement' && initRefersToSchema(arg))
    }

    if (callee.type === 'MemberExpression') return memberChainStartsWithS(callee)
    if (callee.type === 'Identifier') return callee.name.includes('Schema')

    return false
  }

  if (expr.type === 'MemberExpression') return memberChainStartsWithS(expr)

  return false
}

function memberChainStartsWithS(node: MemberExpression): boolean {
  const obj = node.object

  if (obj.type === 'Identifier') return obj.name === 'S' || obj.name.includes('Schema')
  if (obj.type === 'MemberExpression') return memberChainStartsWithS(obj)

  // `Schema.Struct({...}).pipe(...)` — the chain root is a call, not a member
  if (obj.type === 'CallExpression') {
    const callee = obj.callee
    if (callee.type === 'MemberExpression') return memberChainStartsWithS(callee)
    if (callee.type === 'Identifier') return callee.name === 'S' || callee.name.includes('Schema')
  }

  return false
}

/**
 * True when a class extends `Schema.Class(...)` or `Schema.TaggedClass(...)`.
 * The constructor is curried — `Schema.Class<Foo>()({...})` is two nested
 * CallExpressions wrapping one MemberExpression — so unwrap the call chain
 * before inspecting the member.
 *
 * `Schema.TaggedError` is deliberately excluded: an error is a failure value,
 * not a codec, so it is not subject to the round-trip laws (and its `cause`
 * field is routinely `S.Unknown`, which does not round-trip).
 */
function extendsSchemaClass(superClass: Expression | null | undefined): boolean {
  if (!superClass) return false

  let callee: Expression = superClass
  while (callee.type === 'CallExpression') {
    callee = callee.callee
  }

  if (callee.type !== 'MemberExpression') return false
  if (callee.property.type !== 'Identifier') return false

  const propName = callee.property.name
  if (propName !== 'Class' && propName !== 'TaggedClass') return false

  return memberChainStartsWithS(callee)
}

/**
 * Build the law-suite body injected into a consumer's `schema-laws.test.ts`.
 *
 * Import specifiers are relative to `lawFilePath`, never to the Vite root: the
 * file being rewritten lives in `src/`, so a root-relative specifier resolves
 * to `src/src/…` and yields a suite that silently imports nothing.
 *
 * Every schema is imported under a generated local alias. Two modules may
 * export the same name, and a bare `import { X }` pair for them is invalid
 * ESM — one binding wins, so a schema silently loses its laws to its
 * namesake while the suite still reports a passing pair for it. An alias also
 * keeps a schema named `it` or `ruleOfSchemas` from shadowing the harness.
 *
 * @since 1.4.0
 */
export const generateSchemaLaws = (lawFilePath: string, srcDir: string): string => {
  const schemas = findExportedSchemas(srcDir)
  if (schemas.length === 0) return '// no schemas found\nexport {}\n'

  const specifierOf = (filePath: string): string => {
    const rel = relative(dirname(lawFilePath), filePath).replace(/\.ts$/, '')
    return rel.startsWith('.') ? rel : `./${rel}`
  }

  const nameCount = new Map<string, number>()
  for (const s of schemas) nameCount.set(s.name, (nameCount.get(s.name) ?? 0) + 1)

  const labelOf = (s: FoundSchema): string =>
    (nameCount.get(s.name) ?? 0) > 1 ? `${s.name} (${specifierOf(s.filePath)})` : s.name

  const refuted = findRefutedIdentities(srcDir, schemas)
  const quoted = schemas
    .filter((s) => refuted.has(identityOf(s.filePath, s.name)))
    .map((s) => quote(labelOf(s)))
    .sort()
    .join(', ')

  return [
    `import type { AST } from 'effect/SchemaAST'`,
    `import { it } from 'vitest'`,
    `import { obligationsOf, ruleOfSchemas } from '@systemfsoftware/effect-schema-law'`,
    schemas.map((s, i) => `import { ${s.name} as schema_${i} } from ${quote(specifierOf(s.filePath))}`).join('\n'),
    '',
    schemas.map((s, i) => `ruleOfSchemas(${quote(labelOf(s))}, schema_${i})`).join('\n'),
    '',
    `const REFUTED: ReadonlySet<string> = new Set([${quoted}])`,
    '',
    `const EXPORTED: ReadonlyArray<readonly [string, Parameters<typeof obligationsOf>[0]]> = [`,
    schemas.map((s, i) => `  [${quote(labelOf(s))}, schema_${i}],`).join('\n'),
    `]`,
    '',
    `it('every obligation reachable from an exported schema is refuted somewhere', () => {`,
    `  const covered = new Set<AST>()`,
    `  for (const [name, schema] of EXPORTED) {`,
    `    if (!REFUTED.has(name)) continue`,
    `    for (const node of obligationsOf(schema).keys()) covered.add(node)`,
    `  }`,
    `  const naked = EXPORTED`,
    `    .filter(([, schema]) => [...obligationsOf(schema).keys()].some((n) => !covered.has(n)))`,
    `    .map(([name]) => name)`,
    `  if (naked.length > 0) {`,
    "    throw new Error(`schema(s) reaching an obligation no refutes call discharges: ${naked.join(', ')}`)",
    `  }`,
    `})`,
  ].join('\n')
}

/**
 * Vite plugin that walks the consumer's `src/` directory, finds every
 * exported Effect `Schema`, and auto-injects `ruleOfSchemas` round-trip
 * property tests for each one.
 *
 * The laws are injected by rewriting the consumer's own
 * `src/schema-laws.test.ts` — the one test filename the placement taxonomy
 * whitelists by name. It is deliberately NOT a virtual module: the generated
 * body carries real `import` edges to each schema file, so vitest's
 * related-file walk reaches them. A virtual module breaks that walk (its id
 * has no path on disk), which silently drops every generated law from
 * `stryker --related` runs and reports the survivors as coverage gaps.
 *
 * @example
 * ```ts
 * // vitest.config.ts
 * import { inlineSchemaTests } from '@systemfsoftware/effect-schema-vite'
 *
 * export default defineConfig({
 *   plugins: [inlineSchemaTests()],
 * })
 * ```
 */
export const inlineSchemaTests = (options?: InlineSchemaTestsOptions): Plugin => {
  let config: ResolvedConfig

  return {
    name: '@systemfsoftware/schema-laws',
    enforce: 'pre',

    configResolved(c) {
      config = c
    },

    transform(_code, id) {
      const lawFile = id.split('?')[0]
      if (lawFile === undefined || !lawFile.endsWith(`/${LAW_FILE_BASENAME}`)) return
      return generateSchemaLaws(lawFile, resolve(config.root, options?.dir ?? 'src'))
    },
  }
}
