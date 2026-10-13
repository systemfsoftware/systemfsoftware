// mutation-probe.contract.test.ts - what the planner copies from Stryker, checked against Stryker's own config reader:
// which config file it reads.
import { assertEquals } from '@std/assert'
import { dirname, fromFileUrl, join } from '@std/path'

const here = dirname(fromFileUrl(import.meta.url))
const repo = join(here, '..', '..')
const PROBE = await Deno.readTextFile(join(here, 'mutation-probe.mjs'))

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

const MARKERS = new Map(CANDIDATES.map((name, i) => [i + 1, name] as const))

/** A package directory holding every candidate config file, where the probe finds the shared package it imports. */
const candidatesDir = async (): Promise<string> => {
  const dir = await Deno.makeTempDir({ prefix: 'probe-discovery-' })
  await Deno.mkdir(join(dir, 'node_modules', '@systemfsoftware'), { recursive: true })
  await Deno.symlink(
    join(repo, 'packages', 'toolchain', 'stryker-config'),
    join(dir, 'node_modules', '@systemfsoftware', 'stryker-config'),
  )
  await Deno.writeTextFile(
    join(dir, 'package.json'),
    JSON.stringify({ name: 'discovery', type: 'module', private: true }),
  )
  for (const [marker, name] of MARKERS) await Deno.writeTextFile(join(dir, name), configText(name, marker))
  return dir
}

/** The config files Stryker reads in `dir`, in its order, each removed once read (`stryker-reads.ts`). */
const strykerOrder = async (dir: string): Promise<string[]> => {
  const out = await new Deno.Command(Deno.execPath(), {
    args: [
      'run',
      `--config=${join(here, '..', 'deno.jsonc')}`,
      `--lock=${join(here, '..', 'deno.lock')}`,
      '--frozen',
      '--quiet',
      '--allow-read',
      `--allow-write=${dir}`,
      '--allow-env',
      '--allow-sys',
      join(here, 'stryker-reads.ts'),
      JSON.stringify(Object.fromEntries(MARKERS)),
    ],
    cwd: dir,
    stdout: 'piped',
    stderr: 'piped',
  }).output()
  const text = new TextDecoder()
  assertEquals(out.success, true, text.decode(out.stderr))
  return JSON.parse(text.decode(out.stdout).trim().split('\n').at(-1) ?? '[]')
}

/** The config files the probe reads in `dir`, in its order, each removed once read, until it loads none. */
const probeOrder = async (dir: string): Promise<string[]> => {
  const order: string[] = []
  for (;;) {
    const out = await new Deno.Command('node', {
      args: ['--input-type=module', '-e', PROBE],
      cwd: dir,
      stdout: 'piped',
    })
      .output()
    const facts = JSON.parse(new TextDecoder().decode(out.stdout).trim().split('\n').at(-1) ?? '{}')
    if (facts._tag !== 'Loaded') return order
    order.push(String(facts.config))
    await Deno.remove(join(dir, String(facts.config)))
  }
}

Deno.test('the probe reads the config files Stryker reads, in the order Stryker reads them, and no other', async () => {
  const [real, probed] = [await candidatesDir(), await candidatesDir()]
  try {
    const order = await strykerOrder(real)
    // Both walk the same files until they load none, so a name only one of them reads, or one it reads earlier,
    // shows in the order.
    assertEquals(await probeOrder(probed), order)
    assertEquals(order.length > 1, true, `Stryker read ${order.length} config files`)
  } finally {
    for (const dir of [real, probed]) await Deno.remove(dir, { recursive: true })
  }
})
