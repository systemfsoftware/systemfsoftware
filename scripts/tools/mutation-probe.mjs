// mutation-probe.mjs - the facts `test-timings.ts plan --task mutation` judges a
// package by, read the way Stryker reads them. `test-timings` runs it with
// `pnpm exec node --input-type=module -e`, so bare specifiers resolve from the
// package directory: the config is the file Stryker would discover there, and
// `@systemfsoftware/stryker-config` is the copy that package installed.
//
// Prints one JSON line, one `_tag`ged variant:
//   Loaded        { config, shared, mutate, scope }: the config loaded
//   ConfigFailed  { shared, error }: the shared set was read, but the rest of
//                 the shared config could not be, or no config was found, or
//                 it would not load
//   SharedFailed  { error }: `@systemfsoftware/stryker-config` would not load,
//                 or carries no shared set
// where
//   config   the config file Stryker discovers
//   shared   the shared mutated set: its patterns and the files they expand to
//   mutate   `Inherited { negated }` when the config inherits
//            `sharedConfig.mutate` untouched: the same array, the shared
//            patterns first, then only `!<file>` negations, each naming a file
//            of the shared set verbatim, as `shardMutate` appends for the files
//            other shards own (Stryker reads a negation as a glob, so any other
//            spelling could remove files the plan cannot see); `negated` are
//            the files they name. `Own { patterns, extends, files }` otherwise:
//            its patterns (null when it sets none, so Stryker's default
//            applies), its `extends`, and the files its patterns expand to
//   scope    what else selects files: the config's `ignorePatterns` (Stryker's
//            default `[]` when unset), the shared config's as they stood
//            before the config ran, `since` as JSON (null when unset), and
//            every Stryker output path the config set to a value other than
//            the shared one (Stryker's crawl ignores each output path, so one
//            can hide a workflow file)

import { existsSync, globSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

// @systemfsoftware/stryker-js 17.0.2 `DISCOVERABLE_CONFIG_FILE_NAMES`, in its order: the first that exists is read.
// Stryker does not export it; mutation-probe.contract.test.ts compares this order with Stryker's own config reader.
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

// The characters Stryker's mutate matcher can read as a glob (a backslash it rewrites to `/`).
const GLOB_CHARACTER = /[*?{[\\]/

/** @param {readonly string[]} named @param {readonly string[]} sharedFiles */
const namesSharedFiles = (named, sharedFiles) => {
  const files = new Set(sharedFiles)
  return named.every((file) => files.has(file) && !GLOB_CHARACTER.test(file))
}

/** The config keys whose paths Stryker's crawl ignores; a path is read with `.`-separated keys. */
const OUTPUT_PATHS = [
  'tempDirName',
  'incrementalFile',
  'progressStreamFile',
  'htmlReporter.fileName',
  'jsonReporter.fileName',
]

/** @param {unknown} config @param {string} key */
const valueAt = (config, key) =>
  key.split('.').reduce(
    (value, part) => (value !== null && typeof value === 'object' ? value[part] : undefined),
    config,
  )

/** @param {unknown} config */
const outputsOf = (config) =>
  Object.fromEntries(OUTPUT_PATHS.map((key) => [key, JSON.stringify(valueAt(config, key)) ?? null]))

/** @param {unknown} error */
const messageOf = (error) => (error instanceof Error ? error.message : String(error))

/** The shared package and its shared mutated set. */
const loadShared = async () => {
  const module = await import('@systemfsoftware/stryker-config')
  return { module, set: { patterns: [...module.workflowMutate], files: expand(module.workflowMutate) } }
}

/** @param {Awaited<ReturnType<typeof loadShared>>} shared */
const configFacts = async (shared) => {
  try {
    const { workflowMutate, sharedConfig } = shared.module
    // Read before the config runs, since a config can edit the shared config in place.
    const sharedIgnorePatterns = sharedConfig.ignorePatterns.map(String)
    const sharedOutputs = outputsOf(sharedConfig)
    const found = DISCOVERED.find((name) => existsSync(name))
    if (found === undefined) throw new Error(`no Stryker config: none of ${DISCOVERED.join(', ')} exists`)
    const config = (await import(pathToFileURL(found).href)).default ?? {}
    const mutate = config.mutate
    const head = workflowMutate.length
    const tail = Array.isArray(mutate) ? mutate.slice(head).map(String) : []
    const named = tail.map((pattern) => pattern.slice(1))
    const inherited = mutate === sharedConfig.mutate &&
      samePatterns(mutate.slice(0, head), workflowMutate) &&
      tail.every((pattern) => pattern.startsWith('!')) &&
      namesSharedFiles(named, shared.set.files)
    const patterns = Array.isArray(mutate) ? mutate.map(String) : null
    const outputs = outputsOf(config)
    return {
      _tag: 'Loaded',
      config: found,
      shared: shared.set,
      mutate: inherited && config.extends === undefined
        ? { _tag: 'Inherited', negated: named }
        : { _tag: 'Own', patterns, extends: config.extends ?? null, files: patterns === null ? [] : expand(patterns) },
      scope: {
        ignorePatterns: Array.isArray(config.ignorePatterns) ? config.ignorePatterns.map(String) : [],
        sharedIgnorePatterns,
        since: config.since === undefined ? null : JSON.stringify(config.since),
        outputs: OUTPUT_PATHS.filter((key) => outputs[key] !== sharedOutputs[key])
          .map((key) => ({ key, value: outputs[key] ?? 'undefined' })),
      },
    }
  } catch (error) {
    return { _tag: 'ConfigFailed', shared: shared.set, error: messageOf(error) }
  }
}

console.log(JSON.stringify(
  await loadShared().then(configFacts, (error) => ({ _tag: 'SharedFailed', error: messageOf(error) })),
))
