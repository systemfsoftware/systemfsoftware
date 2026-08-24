import {
  findExportedSchemas,
  findRefutedIdentities,
  type FoundSchema,
  identityOf,
  quote,
} from '@systemfsoftware/effect-schema-discovery'
import { dirname, relative, resolve } from 'node:path'
import type { Plugin, ResolvedConfig } from 'vite'

/** @since 0.1.0 */
export interface InlineRefutationCoverageOptions {
  /** Directory to scan for schema files, relative to Vite root. Default: `"src"`. */
  dir?: string
}

/**
 * The one test filename the placement taxonomy whitelists by name. The plugin
 * rewrites this file in the consumer's `src/`; nothing else is touched.
 *
 * @since 0.1.0
 */
export const REFUTATION_FILE_BASENAME = 'schema-refutations.test.ts' as const

/**
 * Build the obligation-coverage body injected into a consumer's `schema-refutations.test.ts`.
 *
 * Import specifiers are relative to `refutationFilePath`, never to the Vite root: the
 * file being rewritten lives in `src/`, so a root-relative specifier resolves
 * to `src/src/…` and yields a suite that silently imports nothing.
 *
 * Every schema is imported under a generated local alias. Two modules may
 * export the same name, and a bare `import { X }` pair for them is invalid
 * ESM — one binding wins, so a schema silently loses its coverage to its
 * namesake while the suite still reports a passing assertion for it. An alias also
 * keeps a schema named `it` from shadowing the harness.
 *
 * @since 0.1.0
 */
export const generateRefutationCoverage = (refutationFilePath: string, srcDir: string): string => {
  const schemas = findExportedSchemas(srcDir)
  if (schemas.length === 0) return '// no schemas found\nexport {}\n'

  const specifierOf = (filePath: string): string => {
    const rel = relative(dirname(refutationFilePath), filePath).replace(/\.ts$/, '')
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
    `import { obligationsOf } from '@systemfsoftware/effect-schema-law/refutation'`,
    schemas.map((s, i) => `import { ${s.name} as schema_${i} } from ${quote(specifierOf(s.filePath))}`).join('\n'),
    '',
    `const REFUTED: ReadonlySet<string> = new Set([${quoted}])`,
    '',
    `const EXPORTED: ReadonlyArray<readonly [string, Parameters<typeof obligationsOf>[0]]> = [`,
    schemas.map((s, i) => `  [${quote(labelOf(s))}, schema_${i}],`).join('\n'),
    `]`,
    '',
    `it('every obligation reachable from an exported schema is refuted somewhere', () => {`,
    `  // One scan per schema: obligationsOf hunts a witness per arm, so asking`,
    `  // twice doubles the most expensive work in this suite.`,
    `  const scanned = EXPORTED.map(([name, schema]) => [name, [...obligationsOf(schema).keys()]] as const)`,
    `  const covered = new Set<AST>()`,
    `  for (const [name, nodes] of scanned) {`,
    `    if (!REFUTED.has(name)) continue`,
    `    for (const node of nodes) covered.add(node)`,
    `  }`,
    `  const naked = scanned`,
    `    .filter(([, nodes]) => nodes.some((n) => !covered.has(n)))`,
    `    .map(([name]) => name)`,
    `  if (naked.length > 0) {`,
    "    throw new Error(`schema(s) reaching an obligation no refutes call discharges: ${naked.join(', ')}`)",
    `  }`,
    `})`,
  ].join('\n')
}

/**
 * Vite plugin that walks the consumer's `src/` directory, finds every
 * exported Effect `Schema`, and auto-injects obligation-coverage assertions.
 *
 * The assertion is injected by rewriting the consumer's own
 * `src/schema-refutations.test.ts` — the second test filename the placement
 * taxonomy whitelists by name. It is deliberately NOT a virtual module: the
 * generated body carries real `import` edges to each schema file, so vitest's
 * related-file walk reaches them. A virtual module breaks that walk (its id
 * has no path on disk), which silently drops coverage from
 * `stryker --related` runs.
 *
 * @example
 * ```ts
 * // vitest.config.ts
 * import { inlineRefutationCoverage } from '@systemfsoftware/effect-schema-refutation-vite'
 *
 * export default defineConfig({
 *   plugins: [inlineRefutationCoverage()],
 * })
 * ```
 */
export const inlineRefutationCoverage = (options?: InlineRefutationCoverageOptions): Plugin => {
  let config: ResolvedConfig

  return {
    name: '@systemfsoftware/refutation-coverage',
    enforce: 'pre',

    configResolved(c) {
      config = c
    },

    transform(_code, id) {
      const refutationFile = id.split('?')[0]
      if (refutationFile === undefined || !refutationFile.endsWith(`/${REFUTATION_FILE_BASENAME}`)) return
      return generateRefutationCoverage(refutationFile, resolve(config.root, options?.dir ?? 'src'))
    },
  }
}
