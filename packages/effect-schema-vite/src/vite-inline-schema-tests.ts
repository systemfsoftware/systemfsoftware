// @ts-nocheck — oxc-parser AST types use index signatures extensively
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join, relative, resolve } from 'node:path'
import { parseSync } from 'oxc-parser'
import type { Plugin, ResolvedConfig } from 'vite'

/** @since 0.1.0 */
export interface InlineSchemaTestsOptions {
  /** Directory to scan for schema files, relative to Vite root. Default: `"src"`. */
  dir?: string
}

interface FoundSchema {
  name: string
  importPath: string
}

/**
 * Walk a directory and return every exported const whose type annotation
 * or initialiser references Effect Schema APIs.
 */
function findExportedSchemas(root: string, dir: string): FoundSchema[] {
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
          schemas.push({ name, importPath: `./${relative(root, full).replace(/\.ts$/, '')}` })
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
      if (!decl || decl.type !== 'VariableDeclaration') continue

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

function typeRefContainsSchema(t: unknown): boolean {
  if (!t || typeof t !== 'object') return false
  const node = t as Record<string, unknown>

  if (node.type === 'TSTypeReference' && node.typeName) {
    const tn = node.typeName as Record<string, unknown>
    if (tn.type === 'Identifier' && typeof tn.name === 'string' && tn.name.includes('Schema')) {
      return true
    }
    if (tn.type === 'TSQualifiedName' && typeof tn.name === 'string' && tn.name.includes('Schema')) {
      return true
    }
  }

  if (node.typeParameters) {
    const params = node.typeParameters as Record<string, unknown>
    if (Array.isArray(params.params)) {
      for (const p of params.params) {
        if (typeRefContainsSchema(p)) return true
      }
    }
  }

  if (node.types && Array.isArray(node.types)) {
    for (const m of node.types) {
      if (typeRefContainsSchema(m)) return true
    }
  }

  return false
}

function initRefersToSchema(expr: unknown): boolean {
  if (!expr || typeof expr !== 'object') return false
  const node = expr as Record<string, unknown>

  if (node.type === 'CallExpression' && node.callee) {
    const callee = node.callee as Record<string, unknown>

    if (callee.type === 'Identifier' && callee.name === 'pipe') {
      const args = node.arguments
      if (Array.isArray(args)) {
        for (const arg of args) {
          if (initRefersToSchema(arg)) return true
        }
      }
      return false
    }

    if (callee.type === 'MemberExpression') {
      return memberChainStartsWithS(callee)
    }

    if (callee.type === 'Identifier' && (callee.name as string).includes('Schema')) {
      return true
    }
  }

  if (node.type === 'MemberExpression') {
    return memberChainStartsWithS(node)
  }

  return false
}

function memberChainStartsWithS(node: Record<string, unknown>): boolean {
  const obj = node.object as Record<string, unknown> | undefined
  if (!obj) return false

  if (obj.type === 'Identifier' && obj.name === 'S') return true
  if (obj.type === 'Identifier' && typeof obj.name === 'string' && (obj.name as string).includes('Schema')) {
    return true
  }

  if (obj.type === 'MemberExpression') {
    return memberChainStartsWithS(obj)
  }

  return false
}

/**
 * Vite plugin that walks the consumer's `src/` directory, finds every
 * exported Effect `Schema`, and auto-injects `ruleOfSchemas` round-trip
 * property tests for each one.
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
    name: '@systemfsoftware/inline-schema-tests',
    enforce: 'pre',

    configResolved(c) {
      config = c
    },

    resolveId(id) {
      if (id === 'virtual:@systemfsoftware/inline-schema-tests') {
        return '\0virtual:@systemfsoftware/inline-schema-tests'
      }
    },

    load(id) {
      if (id !== '\0virtual:@systemfsoftware/inline-schema-tests') return

      const srcDir = resolve(config.root, options?.dir ?? 'src')
      const schemas = findExportedSchemas(config.root, srcDir)

      if (schemas.length === 0) {
        return '// no schemas found'
      }

      const imports = schemas
        .map((s) => `import { ${s.name} } from '${s.importPath}'`)
        .join('\n')

      const calls = schemas
        .map((s) => `ruleOfSchemas('${s.name}', ${s.name})`)
        .join('\n')

      return [
        `import { ruleOfSchemas } from '@systemfsoftware/effect-schema-law'`,
        imports,
        '',
        calls,
      ].join('\n')
    },
  }
}
