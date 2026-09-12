/**
 * Census enumerator — see CENSUS.md for the record and the claim kinds.
 *
 * Run from this directory (the repo has no root `node_modules`, and this package
 * is the one whose workspace links cover every plugin), after `pnpm gate:dist`:
 *
 *     node --experimental-strip-types ./run.ts "$(pwd)/../"
 *
 * Prints the rule inventory as JSON on stdout. It reads each plugin's runtime
 * `rules` map rather than any README, so the ids are the ids oxlint resolves.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { PLUGIN_PACKAGES, RETIRED_OR_ABSENT } from './packages.ts'

const PLUGIN_DIR = process.argv[2]
if (PLUGIN_DIR === undefined) {
  throw new Error('usage: node --experimental-strip-types ./run.ts <packages/oxlint-plugin>')
}

interface RuleInventory {
  readonly pkg: string
  readonly name: string
  readonly version: string
  readonly private: boolean
  readonly namespace: string | null
  readonly rules: readonly string[]
  readonly recommended: readonly string[]
  readonly configKeys: readonly string[]
}

interface PackageFacts extends RuleInventory {
  readonly ruleCount: number
  readonly recommendedCount: number
  readonly unrecommended: readonly string[]
  readonly ruleSources: number
  readonly configSources: number
  readonly testSources: number
  readonly hasMutationCell: boolean
  readonly mutate: readonly string[] | null
}

interface SourceCounts {
  readonly rule: number
  readonly config: number
  readonly test: number
}

/** Count `src/rules/**.ts` by kind: rule source, `*.config.ts`, or test. */
const countSources = (pkg: string): SourceCounts => {
  let rule = 0
  let config = 0
  let test = 0
  const walk = (dir: string, rel: string): void => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name)
      const relPath = `${rel}/${name}`
      if (statSync(full).isDirectory()) {
        walk(full, relPath)
        continue
      }
      if (!name.endsWith('.ts')) continue
      if (name.endsWith('.config.ts')) config += 1
      else if (relPath.includes('__tests__') || name.endsWith('.test.ts')) test += 1
      else rule += 1
    }
  }
  try {
    walk(join(PLUGIN_DIR, pkg, 'src', 'rules'), 'src/rules')
  } catch {
    // The aggregating packages own no `src/rules`; their leaves are counted where they live.
  }
  return { rule, config, test }
}

const readMutationCell = (pkg: string): readonly string[] | null => {
  try {
    const config: unknown = JSON.parse(readFileSync(join(PLUGIN_DIR, pkg, 'stryker.config.json'), 'utf8'))
    if (typeof config !== 'object' || config === null) return null
    const mutate = (config as { mutate?: unknown }).mutate
    return Array.isArray(mutate) ? (mutate as string[]) : null
  } catch {
    return null
  }
}

const inventory: RuleInventory[] = []
for (const pkg of PLUGIN_PACKAGES) {
  const dir = join(PLUGIN_DIR, pkg)
  const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  const entry: string = manifest.exports['.'].default
  const module_: {
    default: {
      meta?: { name?: string }
      rules?: Record<string, unknown>
      configs?: Record<string, { rules?: Record<string, unknown> }>
    }
  } = await import(
    join(dir, entry)
  )
  const plugin = module_.default
  inventory.push({
    pkg,
    name: manifest.name,
    version: manifest.version,
    private: manifest.private === true,
    namespace: plugin.meta?.name ?? null,
    rules: Object.keys(plugin.rules ?? {}).sort(),
    recommended: Object.keys(plugin.configs?.['recommended']?.rules ?? {}).sort(),
    configKeys: Object.keys(plugin.configs ?? {}).sort(),
  })
}

const rows: PackageFacts[] = inventory.map((entry) => {
  const sources = countSources(entry.pkg)
  const mutate = readMutationCell(entry.pkg)
  return {
    ...entry,
    ruleCount: entry.rules.length,
    recommendedCount: entry.recommended.length,
    unrecommended: entry.rules.filter((rule) => !entry.recommended.some((id) => id.endsWith(`/${rule}`))),
    ruleSources: sources.rule,
    configSources: sources.config,
    testSources: sources.test,
    hasMutationCell: mutate !== null,
    mutate,
  }
})

const ownersById = new Map<string, string[]>()
for (const row of rows) {
  for (const rule of row.rules) {
    const id = `${row.namespace ?? row.name}/${rule}`
    ownersById.set(id, [...(ownersById.get(id) ?? []), row.name])
  }
}

const totals = {
  pluginPackages: rows.length,
  publicPluginPackages: rows.filter((row) => !row.private).length,
  privatePluginPackages: rows.filter((row) => row.private).length,
  registeredRuleIds: ownersById.size,
  duplicateRuleIds: [...ownersById].filter(([, owners]) => owners.length > 1),
  ruleSources: rows.reduce((n, row) => n + row.ruleSources, 0),
  configSources: rows.reduce((n, row) => n + row.configSources, 0),
  testSources: rows.reduce((n, row) => n + row.testSources, 0),
  mutationCells: rows.filter((row) => row.hasMutationCell).length,
  retiredOrAbsent: RETIRED_OR_ABSENT,
  ruleIds: [...ownersById.keys()].sort(),
}

process.stdout.write(`${JSON.stringify({ totals, rows }, null, 2)}\n`)
