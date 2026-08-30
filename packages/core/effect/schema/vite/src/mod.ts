import { findExportedSchemas, type FoundSchema, quote } from '@systemfsoftware/effect-schema-discovery'
import { dirname, relative, resolve } from 'node:path'
import type { Plugin, ResolvedConfig } from 'vite'

/**
 * @public
 * @since 0.1.0
 */
export interface InlineSchemaTestsOptions {
  /** Directory to scan for schema files, relative to Vite root. Default: `"src"`. */
  dir?: string
}

/**
 * The one test filename the placement taxonomy whitelists by name. The plugin
 * rewrites this file in the consumer's `src/`; nothing else is touched.
 *
 * @public
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
 * @public
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

  return [
    `import { ruleOfSchemas } from '@systemfsoftware/effect-schema-law'`,
    schemas.map((s, i) => `import { ${s.name} as schema_${i} } from ${quote(specifierOf(s.filePath))}`).join('\n'),
    '',
    schemas.map((s, i) => `ruleOfSchemas(${quote(labelOf(s))}, schema_${i})`).join('\n'),
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
 * @public
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
