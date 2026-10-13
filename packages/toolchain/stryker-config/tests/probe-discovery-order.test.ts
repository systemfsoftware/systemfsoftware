// The Mutation plan's probe (scripts/tools/mutation-probe.mjs) copies the config file names Stryker discovers. This
// test compares that copy with the Stryker this package installs, by Stryker's own reader (`Configuration.readConfig`,
// as `stryker run` calls it). It runs in the installed test lane. turbo keys it on the Stryker version pnpm-lock.yaml
// resolves for this package, and its turbo.json adds the probe, pnpm-workspace.yaml (patches, overrides) and patches/
// to its inputs, so a Stryker bump, override or patch, or a probe edit, re-runs it against what was installed.
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { expect, test } from 'vitest'

const run = promisify(execFile)
const packageDir = dirname(dirname(fileURLToPath(import.meta.url)))
const PROBE = await readFile(join(packageDir, '..', '..', '..', 'scripts', 'tools', 'mutation-probe.mjs'), 'utf8')

// The installed Stryker, and the `effect` and platform it loads, resolved from where pnpm put them for this package.
const fromHere = createRequire(import.meta.url)
const stryker = fromHere.resolve('@systemfsoftware/stryker-js')
const fromStryker = createRequire(stryker)
const MODULES = {
  STRYKER: pathToFileURL(stryker).href,
  EFFECT: pathToFileURL(fromStryker.resolve('effect')).href,
  PLATFORM: pathToFileURL(fromStryker.resolve('@effect/platform-node')).href,
}

/**
 * Every name a config file could plausibly be given: the prefixes, stems, suffixes and extensions Stryker's names are
 * built from, and neighbours of each (legacy JSON and CommonJS, other module extensions, case and separator spellings),
 * so a name Stryker reads that the probe does not know is among them.
 */
const CANDIDATES = ['', '.', '_'].flatMap((prefix) =>
  ['stryker', 'Stryker', 'stryker-config'].flatMap((stem) =>
    ['', '.conf', '.config'].flatMap((suffix) =>
      ['ts', 'mts', 'cts', 'tsx', 'js', 'mjs', 'cjs', 'json'].map((extension) =>
        `${prefix}${stem}${suffix}.${extension}`
      )
    )
  )
)

/** A config file named `name` whose `concurrency` is `marker`, written in the form its extension loads as. */
const configText = (name: string, marker: number): string =>
  name.endsWith('.json')
    ? JSON.stringify({ concurrency: marker })
    : name.endsWith('.cjs')
    ? `module.exports = { concurrency: ${marker} }\n`
    : `export default { concurrency: ${marker} }\n`

/** Each candidate's `concurrency` marker, so the file Stryker read can be named from the options it returns. */
const MARKERS = new Map(CANDIDATES.map((name, i) => [i + 1, name] as const))

/** A package directory holding every candidate config file, where the probe finds this package as it imports it. */
const candidatesDir = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), 'probe-discovery-'))
  await mkdir(join(dir, 'node_modules', '@systemfsoftware'), { recursive: true })
  await symlink(packageDir, join(dir, 'node_modules', '@systemfsoftware', 'stryker-config'))
  await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'discovery', type: 'module', private: true }))
  for (const [marker, name] of MARKERS) await writeFile(join(dir, name), configText(name, marker))
  return dir
}

/**
 * Reads with Stryker's reader, removes the file it read, and repeats until it loads none; prints the names. The three
 * library modules are imported by the paths resolved above, chosen at run time, so the child loads this package's
 * Stryker rather than whatever its working directory would resolve.
 */
const READER = `
import { rmSync } from 'node:fs'
const { Configuration } = await import(process.env.STRYKER)
const { Effect, Layer, Result } = await import(process.env.EFFECT)
const { NodeFileSystem, NodePath } = await import(process.env.PLATFORM)
const nameOf = JSON.parse(process.env.NAMES)
const read = async () =>
  Result.match(
    await Effect.runPromise(
      Effect.result(Configuration.readConfig({}, { command: 'run', mode: 'machine' })).pipe(
        Effect.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)),
      ),
    ),
    { onSuccess: (options) => nameOf[String(options.concurrency)] ?? null, onFailure: () => null },
  )
const order = []
for (let name = await read(); name !== null; name = await read()) {
  order.push(name)
  rmSync(name)
}
console.log(JSON.stringify(order))
`

const lastLine = (stdout: string): string => stdout.trim().split('\n').at(-1) ?? ''

/** The config files the installed Stryker reads in `dir`, in its order, each removed once read. */
const strykerOrder = async (dir: string): Promise<string[]> => {
  const { stdout } = await run(process.execPath, ['--input-type=module', '-e', READER], {
    cwd: dir,
    env: { ...process.env, ...MODULES, NAMES: JSON.stringify(Object.fromEntries(MARKERS)) },
    maxBuffer: 16 * 1024 * 1024,
  })
  return JSON.parse(lastLine(stdout)) as string[]
}

/** The config files the probe reads in `dir`, in its order, each removed once read, until it loads none. */
const probeOrder = async (dir: string): Promise<string[]> => {
  const order: string[] = []
  for (;;) {
    const { stdout } = await run(process.execPath, ['--input-type=module', '-e', PROBE], { cwd: dir })
    const facts = JSON.parse(lastLine(stdout) || '{}') as { readonly _tag?: string; readonly config?: string }
    if (facts._tag !== 'Loaded' || facts.config === undefined) return order
    order.push(facts.config)
    await rm(join(dir, facts.config))
  }
}

test('the probe reads the config files the installed Stryker reads, in its order, and no other', async () => {
  const [real, probed] = [await candidatesDir(), await candidatesDir()]
  try {
    const order = await strykerOrder(real)
    // Both walk the same files until they load none, so a name only one of them reads, or one it reads earlier,
    // shows in the order.
    expect(await probeOrder(probed)).toEqual(order)
    expect(order.length).toBeGreaterThan(1)
  } finally {
    for (const dir of [real, probed]) await rm(dir, { recursive: true, force: true })
  }
}, 180_000)
