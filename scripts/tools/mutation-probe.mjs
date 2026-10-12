// mutation-probe.mjs - the facts `test-timings.ts plan --task mutation` judges a
// package by, read the way Stryker reads them. `test-timings` runs it with
// `pnpm exec node --input-type=module -e`, so bare specifiers resolve from the
// package directory: the config is the file Stryker would discover there, and
// `@systemfsoftware/stryker-config` is the copy that package installed.
//
// Prints one JSON line: `{ config, shared, own, error, negated }`.
//   config   the config file Stryker discovers, or null
//   shared   the shared mutated set: its patterns and the files they expand to
//   own      null when the config inherits `sharedConfig.mutate` untouched:
//            the same array, the shared patterns first, then only the `!<file>`
//            negations `shardMutate` appends for the files other shards own;
//            otherwise its own patterns (null when it sets none, so Stryker's
//            default applies), its `extends`, and the files its patterns expand to
//   error    why the config or the shared package could not be loaded, or null
//   negated  the files those trailing negations name, when `own` is null

import { existsSync, globSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

// @systemfsoftware/stryker-js 17.0.2 `DISCOVERABLE_CONFIG_FILE_NAMES`, in its order: the first that exists is read.
const DISCOVERED = ['', '.'].flatMap((prefix) =>
  ['.conf', '.config'].flatMap((suffix) => ['ts', 'mts', 'js', 'mjs'].map((ext) => `${prefix}stryker${suffix}.${ext}`))
)

/** @param {readonly string[]} patterns */
const expand = (patterns) =>
  globSync(patterns.filter((pattern) => !pattern.startsWith('!')), {
    exclude: patterns.filter((pattern) => pattern.startsWith('!')).map((pattern) => pattern.slice(1)),
  }).sort()

/** @param {unknown} left @param {readonly string[]} right */
const samePatterns = (left, right) =>
  Array.isArray(left) && left.length === right.length && left.every((pattern, i) => pattern === right[i])

const facts = { config: null, shared: null, own: null, error: null, negated: [] }
try {
  const shared = await import('@systemfsoftware/stryker-config')
  facts.shared = { patterns: [...shared.workflowMutate], files: expand(shared.workflowMutate) }
  facts.config = DISCOVERED.find((name) => existsSync(name)) ?? null
  if (facts.config === null) throw new Error(`no Stryker config: none of ${DISCOVERED.join(', ')} exists`)
  const config = (await import(pathToFileURL(facts.config).href)).default ?? {}
  const mutate = config.mutate
  const head = shared.workflowMutate.length
  const tail = Array.isArray(mutate) ? mutate.slice(head).map(String) : []
  const inherited = mutate === shared.sharedConfig.mutate &&
    samePatterns(mutate.slice(0, head), shared.workflowMutate) &&
    tail.every((pattern) => pattern.startsWith('!'))
  if (!inherited || config.extends !== undefined) {
    const patterns = Array.isArray(mutate) ? mutate.map(String) : null
    facts.own = { patterns, extends: config.extends ?? null, files: patterns === null ? [] : expand(patterns) }
  } else {
    facts.negated = tail.map((pattern) => pattern.slice(1))
  }
} catch (error) {
  facts.error = error instanceof Error ? error.message : String(error)
}
console.log(JSON.stringify(facts))
