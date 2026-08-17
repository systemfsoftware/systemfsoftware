#!/usr/bin/env -S deno run --allow-read=. --allow-run=git
/**
 * High-level workspace map, derived from `pnpm-workspace.yaml` on every run.
 *
 * Emits a TOON document (@toon-format/toon): the same JSON data model as the
 * JSON it replaced, encoded in a columnar form an agent parses with fewer tokens
 * and fewer chances to miscount. The `packages` table carries one row per
 * workspace package — the glob that matched it, its directory and name, whether
 * it publishes, which `AGENTS.md` governs it, and which root-gate tasks it
 * defines. Directories are the unit; files inside a package are never listed,
 * because a file-level map rots on the next refactor.
 *
 * Two properties make this replace a prose index rather than restate one:
 *
 *   - Every fact is recomputed from source bytes. Nothing here is author-supplied,
 *     so the map cannot disagree with the tree.
 *   - It reports what it does NOT cover. A tracked package manifest outside every
 *     workspace glob is listed under `outside`, and an unparseable workspace file
 *     or glob is a hard error rather than a silent omission. A partial map that
 *     reads as complete is the defect this replaces: the prose index it succeeded
 *     named 20 of 51.
 *
 * `packages` columns:
 *   glob        the `packages:` entry from `pnpm-workspace.yaml` that matched
 *   dir         the package directory, relative to the repository root
 *   name        the package.json `name`
 *   published   false exactly when the manifest is `"private": true`
 *   governedBy  the nearest ancestor carrying an `AGENTS.md`; `.` = the root one
 *   gate        one char per `gate` task below: `#` defined, `·` absent — a task
 *               a package does not define is skipped by turbo, not failed, so a
 *               `·` is coverage the root gate does not have
 */

import { parse } from '@std/yaml'
import { encode } from '@toon-format/toon'

const WS = 'pnpm-workspace.yaml'
const SKIP = /(^|\/)(node_modules|repos|\.worktrees|dist)(\/|$)/

/** The tasks the root gate fans out over, in report order. */
const GATE = ['build', 'lint', 'typecheck', 'test', 'attw', 'api:check'] as const

type Pkg = {
  readonly dir: string
  readonly name: string
  readonly published: boolean
  /** Directory of the nearest ancestor `AGENTS.md`, or null when the root governs. */
  readonly governedBy: string | null
  /** Positional mask over `GATE`: `#` defined, `·` absent — two tasks share an initial. */
  readonly gate: string
}

/** The `packages:` sequence from `pnpm-workspace.yaml`, or a hard error naming the entry. */
const globs = async (): Promise<readonly string[]> => {
  const yaml = await Deno.readTextFile(WS)

  let doc: unknown
  try {
    doc = parse(yaml)
  } catch (cause) {
    throw new Error(`${WS}: unparseable YAML — cannot name what the map would miss`, { cause })
  }

  const declared = (doc as { packages?: unknown }).packages
  if (!Array.isArray(declared)) throw new Error(`${WS}: no \`packages:\` sequence`)
  if (declared.length === 0) throw new Error(`${WS}: \`packages:\` block is empty`)

  return declared.map((entry, i) => {
    if (typeof entry !== 'string') throw new Error(`${WS}: entry #${i + 1} is not a string glob`)
    if (!entry.endsWith('/*')) throw new Error(`${WS}: only \`<dir>/*\` globs are understood; got: ${entry}`)
    return entry
  })
}

const exists = async (path: string): Promise<boolean> => {
  try {
    await Deno.stat(path)
    return true
  } catch {
    return false
  }
}

/**
 * The nearest ancestor carrying an `AGENTS.md` is what governs a package and what
 * the delivery hook fires — two workspace members here are governed by a leaf one
 * level up, at a directory that is not itself a package. Reporting only a local
 * `AGENTS.md` would label those root-governed, which is the mislabel this map
 * exists to prevent.
 */
const read = async (dir: string): Promise<Pkg | null> => {
  const manifest = `${dir}/package.json`
  if (!(await exists(manifest))) return null
  const json = JSON.parse(await Deno.readTextFile(manifest)) as {
    name?: string
    private?: boolean
    scripts?: Readonly<Record<string, string>>
  }

  let governedBy: string | null = null
  for (let at = dir; at.includes('/'); at = at.slice(0, at.lastIndexOf('/'))) {
    if (await exists(`${at}/AGENTS.md`)) {
      governedBy = at
      break
    }
  }

  const scripts = json.scripts ?? {}
  const gate = GATE.map((t) => (t in scripts ? '#' : '·')).join('')

  return { dir, name: json.name ?? '(unnamed)', published: json.private !== true, governedBy, gate }
}

/**
 * Every tracked package.json in this repository, so the map can name what the
 * globs miss.
 *
 * Enumeration is `git ls-files`, not a filesystem walk: an untracked manifest is
 * scratch (a mutation sandbox, a build artifact) or a separate checkout, and
 * listing those would drown the miss-list that is the whole point of this pass.
 */
const tracked = async (): Promise<readonly string[]> => {
  const out = await new Deno.Command('git', {
    args: ['ls-files', '--full-name', '*/package.json'],
    stdout: 'piped',
  }).output()
  if (!out.success) throw new Error('git ls-files failed; run this from inside the repository')
  return new TextDecoder().decode(out.stdout)
    .split('\n')
    .filter(Boolean)
    .map((f) => f.slice(0, -'/package.json'.length))
    .filter((d) => !SKIP.test(d))
}

const main = async (): Promise<void> => {
  const declared = await globs()

  const matched = new Map<string, readonly Pkg[]>()
  const claimed = new Set<string>()
  for (const glob of declared) {
    const prefix = glob.slice(0, -2)
    const pkgs: Pkg[] = []
    if (await exists(prefix)) {
      for await (const entry of Deno.readDir(prefix)) {
        if (!entry.isDirectory) continue
        const pkg = await read(`${prefix}/${entry.name}`)
        if (pkg) {
          pkgs.push(pkg)
          claimed.add(pkg.dir)
        }
      }
    }
    matched.set(glob, pkgs.sort((a, b) => a.dir.localeCompare(b.dir)))
  }

  const outside = (await tracked()).filter((d) => !claimed.has(d)).sort()

  const doc = {
    source: WS,
    gate: [...GATE],
    globs: [...declared],
    packages: [...matched].flatMap(([glob, pkgs]) =>
      pkgs.map((p) => ({
        glob,
        dir: p.dir,
        name: p.name,
        published: p.published,
        governedBy: p.governedBy ?? '.',
        gate: p.gate,
      }))
    ),
    outside,
  }

  console.log(encode(doc))
}

await main()
