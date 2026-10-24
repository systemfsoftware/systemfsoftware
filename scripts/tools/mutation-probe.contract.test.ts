// mutation-probe.contract.test.ts - what mutation admission copies from Stryker, checked against the Stryker the
// workspace lockfile resolves: which config file it reads.
import { assertEquals } from '@std/assert'
import { dirname, fromFileUrl, join } from '@std/path'
import { parse } from '@std/yaml'
import contract from '@systemfsoftware/stryker-js-cli-contract/package.json' with { type: 'json' }
import stryker from '@systemfsoftware/stryker-js/package.json' with { type: 'json' }

const here = dirname(fromFileUrl(import.meta.url))
const repo = join(here, '..', '..')
const PROBE = await Deno.readTextFile(join(here, 'mutation-probe.mjs'))

/**
 * Whether a `patchedDependencies` or `overrides` key names Stryker or its contract, as the package rewritten or as the
 * parent whose dependency is. A name counts wherever no package-name character touches it, so the match does not
 * depend on which whitespace pnpm trims from a selector's steps (pnpm 12 trims U+0085, which `String.trim` keeps).
 */
const NAMED = [stryker.name, contract.name].map((name) =>
  new RegExp(`(?:^|[^\\w@/.~-])${name.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}(?:@|[^\\w/.~-]|$)`, 'u')
)
const namesStryker = (key: string): boolean => NAMED.some((pattern) => pattern.test(key))

Deno.test('the Stryker these contracts run against is the one the workspace lockfile resolves, unpatched', async () => {
  const lock = await Deno.readTextFile(join(repo, 'pnpm-lock.yaml'))
  const resolved = (name: string): string[] => [
    ...new Set([...lock.matchAll(new RegExp(`^  '${name}@([^'(]+)':$`, 'gm'))].map((match) => match[1] ?? '')),
  ]
  // A lockfile bump fails here until scripts/deno.jsonc pins the same versions, so the checks below cannot keep
  // passing against a Stryker the workspace no longer runs.
  assertEquals(resolved(stryker.name), [stryker.version])
  assertEquals(resolved(contract.name), [contract.version])
  // A patch or an override changes what the workspace installs under the same version, which the import map's copy
  // would not carry.
  const workspace = parse(await Deno.readTextFile(join(repo, 'pnpm-workspace.yaml'))) as Record<string, unknown>
  const rewritten = ['patchedDependencies', 'overrides'].flatMap((key) =>
    Object.keys((workspace[key] ?? {}) as Record<string, unknown>).filter(namesStryker)
  )
  assertEquals(rewritten, [])
})

Deno.test('an override or patch key that names Stryker or its contract in any spelling pnpm applies is flagged', () => {
  const s = stryker.name
  const c = contract.name
  const cases: ReadonlyArray<readonly [string, boolean]> = [
    [s, true],
    [`${s}@17.0.2`, true],
    [c, true],
    [`some-pkg>${s}`, true],
    [`${s}>@stryker-mutator/api`, true],
    [`${s}@17>dep`, true],
    [`some-pkg> ${s}`, true],
    [` ${s}>dep`, true],
    [`\t${s}`, true],
    [`\u0085${s}>dep`, true],
    [`some-pkg>\u0085${c}`, true],
    [`${s}-vitest-runner`, false],
    [`some-pkg>${s}-typescript-checker@8`, false],
    ['fast-check', false],
    [`x${s}`, false],
  ]
  assertEquals(cases.filter(([key, flagged]) => namesStryker(key) !== flagged), [])
})

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
