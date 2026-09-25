import { globSync, readFileSync } from 'node:fs'

const isAgent = process.env['AGENT'] !== undefined
const isCI = !isAgent && typeof process.env['CI'] === 'string' && process.env['CI'].length > 0

const envConcurrency = process.env['STRYKER_CONCURRENCY'] ??
  (isAgent ? '50%' : isCI ? '100%' : undefined)

export const sharedConfig = {
  packageManager: 'pnpm',
  reporters: isAgent || isCI ? ['json', 'html'] : ['progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/mutation.html' },
  jsonReporter: { fileName: 'reports/mutation/mutation.json' },
  coverageAnalysis: 'perTest',
  incremental: true,
  incrementalFile: 'reports/stryker-incremental.json',
  ignorePatterns: ['reports', 'coverage'],
  disableBail: true,
  cleanTempDir: 'always',
  thresholds: { high: 100, low: 80, break: 100 },
  ...(envConcurrency !== undefined ? { concurrency: envConcurrency } : {}),
}

const SHARD = /^(\d+)\/(\d+)$/
const MUTATION_RANGE = /:\d+(?::\d+)?-\d+(?::\d+)?$/

/**
 * FNV-1a, so every machine rotates a package's slices the same way.
 * @param {string} text
 * @param {number} count
 */
const rotationOf = (text, count) => {
  let hash = 0x811c9dc5
  for (const char of text) hash = Math.imul(hash ^ char.charCodeAt(0), 0x01000193) >>> 0
  return hash % count
}

/**
 * The slice of `patterns` that shard `STRYKER_SHARD=<index>/<count>` mutates.
 *
 * The patterns expand to files, the files sort, and file i goes to shard
 * ((i + rotation) mod count) + 1, so the shards partition the files: each file
 * is mutated by exactly one shard. The rotation derives from the package name
 * in `./package.json`, so packages with fewer files than shards start on
 * different shards instead of piling onto shard 1. Unset, `patterns` pass
 * through unchanged. An empty slice is `[]`, which Stryker reads as "mutate
 * nothing".
 * @param {readonly string[]} patterns
 * @returns {string[]}
 */
export function shardMutate(patterns) {
  const raw = process.env['STRYKER_SHARD']
  if (raw === undefined || raw === '') return [...patterns]
  const match = SHARD.exec(raw)
  const index = Number(match?.[1])
  const count = Number(match?.[2])
  if (match === null || count < 1 || index < 1 || index > count) {
    throw new Error(`STRYKER_SHARD must be <index>/<count> with 1 <= index <= count, got '${raw}'.`)
  }
  const ranged = patterns.filter((pattern) => MUTATION_RANGE.test(pattern))
  if (ranged.length > 0) {
    throw new Error(`shardMutate cannot slice mutation ranges: ${ranged.join(', ')}.`)
  }
  const include = patterns.filter((pattern) => !pattern.startsWith('!'))
  const exclude = patterns.filter((pattern) => pattern.startsWith('!')).map((pattern) => pattern.slice(1))
  const rotation = rotationOf(JSON.parse(readFileSync('package.json', 'utf8')).name, count)
  return globSync(include, { exclude })
    .sort()
    .filter((_, position) => (position + rotation) % count === index - 1)
}
