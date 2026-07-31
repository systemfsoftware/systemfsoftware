import type { Expression, MemberExpression, TSType } from '@oxc-project/types'
import { readdirSync, readFileSync, statSync } from 'node:fs'
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
 * @since 1.4.0
 */
export const generateSchemaLaws = (lawFilePath: string, srcDir: string): string => {
  const schemas = findExportedSchemas(srcDir)
  if (schemas.length === 0) return '// no schemas found\nexport {}\n'

  const specifierOf = (filePath: string): string => {
    const rel = relative(dirname(lawFilePath), filePath).replace(/\.ts$/, '')
    return rel.startsWith('.') ? rel : `./${rel}`
  }

  return [
    `import { ruleOfSchemas } from '@systemfsoftware/effect-schema-law'`,
    schemas.map((s) => `import { ${s.name} } from '${specifierOf(s.filePath)}'`).join('\n'),
    '',
    schemas.map((s) => `ruleOfSchemas('${s.name}', ${s.name})`).join('\n'),
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
