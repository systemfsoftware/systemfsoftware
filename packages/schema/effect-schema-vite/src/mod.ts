import { findExportedSchemas, type FoundSchema, quote } from '@systemfsoftware/effect-schema-discovery'
import {
  RECURSION_BUDGET_RUNTIME_SPECIFIER,
  recursionBudgetTransform,
} from '@systemfsoftware/effect-schema-recursion-budget'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
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
const formatSpecifier = (baseDir: string, filePath: string): string => {
  const rel = relative(baseDir, filePath).replace(/\.ts$/, '')
  return rel.startsWith('.') ? rel : `./${rel}`
}

const incrementCount = (counts: Map<string, number>, name: string): void => {
  const prev = counts.get(name)
  counts.set(name, prev !== undefined ? prev + 1 : 1)
}

const buildNameCounts = (schemas: readonly FoundSchema[]): ReadonlyMap<string, number> => {
  const counts = new Map<string, number>()
  for (const s of schemas) incrementCount(counts, s.name)
  return counts
}

const schemaLabelOf = (s: FoundSchema, count: number, specifier: string): string => {
  if (count > 1) return `${s.name} (${specifier})`
  return s.name
}

export const generateSchemaLaws = (lawFilePath: string, srcDir: string): string => {
  const schemas = findExportedSchemas(srcDir)
  if (schemas.length === 0) return '// no schemas found\nexport {}\n'

  const baseDir = dirname(lawFilePath)
  const nameCount = buildNameCounts(schemas)

  return [
    `import { recursionLaws, ruleOfSchemas } from '@systemfsoftware/effect-schema-law'`,
    schemas.map((s, i) => `import { ${s.name} as schema_${i} } from ${quote(formatSpecifier(baseDir, s.filePath))}`)
      .join('\n'),
    '',
    schemas
      .map((s, i) => {
        const spec = formatSpecifier(baseDir, s.filePath)
        const count = nameCount.get(s.name) ?? 0
        const label = schemaLabelOf(s, count, spec)
        return `ruleOfSchemas(${quote(label)}, schema_${i})\nrecursionLaws(${quote(label)}, schema_${i})`
      })
      .join('\n'),
  ].join('\n')
}

/**
 * Vite plugin that walks the consumer's `src/` directory, finds every
 * exported Effect `Schema`, and auto-injects `ruleOfSchemas` round-trip
 * property tests and `recursionLaws` generation laws for each one.
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
const isLawTarget = (lawFile: string | undefined): boolean => {
  if (lawFile === undefined) return false
  return lawFile.endsWith(`/${LAW_FILE_BASENAME}`)
}

const targetLawFile = (id: string): string | undefined => {
  const [lawFile] = id.split('?')
  if (isLawTarget(lawFile)) return lawFile
  return undefined
}

const defaultDir = (dir: string | undefined): string => {
  if (dir !== undefined) return dir
  return 'src'
}

const resolveTargetDir = (options: InlineSchemaTestsOptions | undefined): string => {
  if (options !== undefined) return defaultDir(options.dir)
  return 'src'
}
export const inlineSchemaTests = (options?: InlineSchemaTestsOptions): Plugin => {
  const budgets = recursionBudgetTransform()
  let config: ResolvedConfig

  return {
    name: '@systemfsoftware/schema-laws',
    enforce: 'pre',

    resolveId(source: string): string | null {
      if (source !== RECURSION_BUDGET_RUNTIME_SPECIFIER) return null
      return fileURLToPath(import.meta.resolve(RECURSION_BUDGET_RUNTIME_SPECIFIER))
    },

    configResolved(c) {
      config = c
    },

    transform(code, id) {
      const lawFile = targetLawFile(id)
      if (lawFile === undefined) return budgets.transform(code, id)
      return generateSchemaLaws(lawFile, resolve(config.root, resolveTargetDir(options)))
    },
  }
}
