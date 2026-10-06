#!/usr/bin/env -S deno run --allow-read --allow-write
import { parseArgs } from '@std/cli/parse-args'
import { join, resolve } from '@std/path'
import { parse as parseToml } from '@std/toml'

const REPO_ROOT = join(import.meta.dirname!, '..', '..', '..')

type TomlHeader = '[workspace.package]' | '[package]'

interface TomlDocument {
  workspace?: { package?: { version?: unknown } }
  package?: { name?: unknown; version?: unknown }
}

interface Rewrite {
  path: string
  current: string
  next: string
}

class SyncRefusal extends Error {}

const refuse = (message: string): never => {
  throw new SyncRefusal(`sync-version: ${message}`)
}

const VERSION_RE = /^\d+\.\d+\.\d+(-[A-Za-z0-9.-]+)?$/

export const assertVersion = (version: unknown): string =>
  typeof version === 'string' && VERSION_RE.test(version)
    ? version
    : refuse(`invalid version: ${JSON.stringify(version)}`)

const readIfPresent = async (path: string): Promise<string | undefined> => {
  try {
    return await Deno.readTextFile(path)
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return undefined
    throw error
  }
}

const messageOf = (error: unknown): string => error instanceof Error ? error.message : String(error)

const parseTomlOrRefuse = (text: string, path: string): TomlDocument => {
  try {
    return parseToml(text) as TomlDocument
  } catch (error) {
    return refuse(`${path} is not valid TOML: ${messageOf(error)}`)
  }
}

export const tomlRewrite = (
  path: string,
  current: string,
  version: string,
  header: TomlHeader,
): Rewrite | undefined => {
  const parsed = parseTomlOrRefuse(current, path)
  const section = header === '[workspace.package]' ? parsed.workspace?.package : parsed.package
  const found: unknown = section?.version
  if (typeof found !== 'string') {
    if (header === '[package]') return undefined
    return refuse(`no version under ${header} in ${path}`)
  }
  if (found === version) return undefined

  const lines = current.split('\n')
  let inSection = false
  let replaced = false
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!
    const trimmed = line.trim()
    if (trimmed.startsWith('[')) {
      inSection = trimmed === header
      continue
    }
    if (!inSection) continue
    const match = /^(\s*version\s*=\s*)("[^"]*")(.*)$/.exec(line)
    if (match === null) continue
    lines[index] = `${match[1]}"${version}"${match[3]}`
    replaced = true
    break
  }
  if (!replaced) {
    return refuse(`${path} has a version under ${header} that is not a plain assignment`)
  }
  const next = lines.join('\n')
  const reparsed = parseTomlOrRefuse(next, path)
  const after: unknown = header === '[workspace.package]'
    ? reparsed.workspace?.package?.version
    : reparsed.package?.version
  if (after !== version) {
    return refuse(`rewriting ${header} in ${path} did not take (${String(after)})`)
  }
  return { path, current, next }
}

export const memberCargoPaths = async (root: string): Promise<string[]> => {
  const paths: string[] = []
  for (const group of ['apps', 'crates']) {
    try {
      for await (const entry of Deno.readDir(join(root, group))) {
        if (!entry.isDirectory) continue
        paths.push(join(root, group, entry.name, 'Cargo.toml'))
      }
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) continue
      throw error
    }
  }
  return paths.sort()
}

export const memberNames = async (paths: string[]): Promise<Set<string>> => {
  const names = new Set<string>()
  for (const path of paths) {
    const current = await readIfPresent(path)
    if (current === undefined) continue
    const name: unknown = parseTomlOrRefuse(current, path).package?.name
    if (typeof name === 'string') names.add(name)
  }
  return names
}

export const lockRewrite = (path: string, current: string, names: Set<string>, version: string): Rewrite => {
  const blocks = current.split('\n[[package]]\n')
  const next = blocks
    .map((block, index) => {
      if (index === 0) return block
      const name = /^name = "([^"]*)"$/m.exec(block)?.[1]
      if (name === undefined || !names.has(name) || /^source = /m.test(block)) return block
      return block.replace(/^version = "[^"]*"$/m, `version = "${version}"`)
    })
    .join('\n[[package]]\n')
  const parsed: unknown = parseToml(next)
  const entries: unknown = parsed !== null && typeof parsed === 'object' && 'package' in parsed ? parsed.package : []
  const stale = (Array.isArray(entries) ? entries : []).flatMap((entry: unknown) => {
    if (entry === null || typeof entry !== 'object' || 'source' in entry) return []
    const name = 'name' in entry ? entry.name : undefined
    const pinned = 'version' in entry ? entry.version : undefined
    return typeof name === 'string' && names.has(name) && pinned !== version ? [name] : []
  })
  if (stale.length > 0) {
    return refuse(`${path} still pins ${stale.join(', ')} below ${version}`)
  }
  return { path, current, next }
}

const selftest = async (): Promise<number> => {
  const refusal = (run: () => unknown, needle: string): boolean => {
    try {
      run()
      return false
    } catch (error) {
      return error instanceof SyncRefusal && error.message.includes(needle)
    }
  }
  const workspaceToml =
    '[workspace]\nmembers = ["crates/*"]\n\n[workspace.package]\nversion = "0.1.0" # bumped by release\nedition = "2024"\n\n[workspace.lints.rust]\nunsafe_code = "forbid"\n'
  const memberToml = (name: string, version: string) =>
    `[package]\nname = "${name}"\nversion = "${version}"\n\n[dependencies]\nserde = { version = "1.0.0" }\n`
  const inheritingToml = '[package]\nname = "inherits"\nversion.workspace = true\n'
  const lock = [
    'version = 4',
    '',
    '[[package]]',
    'name = "gritlint"',
    'version = "0.1.0"',
    'dependencies = [',
    ' "serde",',
    ']',
    '',
    '[[package]]',
    'name = "serde"',
    'version = "1.0.0"',
    'source = "registry+https://github.com/rust-lang/crates.io-index"',
    '',
    '[[package]]',
    'name = "gritlint-core"',
    'version = "0.1.0"',
    '',
  ].join('\n')

  const bumped = tomlRewrite('Cargo.toml', workspaceToml, '0.2.0', '[workspace.package]')
  const member = tomlRewrite('crates/a/Cargo.toml', memberToml('a', '0.1.0'), '0.2.0', '[package]')
  const relocked = lockRewrite('Cargo.lock', lock, new Set(['gritlint', 'gritlint-core']), '0.2.0')

  const root = await Deno.makeTempDir({ prefix: 'sync-version-selftest-' })
  try {
    await Deno.mkdir(join(root, 'crates', 'b'), { recursive: true })
    await Deno.mkdir(join(root, 'apps', 'a'), { recursive: true })
    await Deno.writeTextFile(join(root, 'crates', 'not-a-crate.md'), '')
    await Deno.writeTextFile(join(root, 'apps', 'a', 'Cargo.toml'), memberToml('app-a', '0.1.0'))
    await Deno.writeTextFile(join(root, 'crates', 'b', 'Cargo.toml'), inheritingToml)
    const paths = await memberCargoPaths(root)
    const names = await memberNames(paths)

    const cases: ReadonlyArray<[string, boolean]> = [
      [
        'the workspace version is rewritten in place, keeping its comment and every other line',
        bumped?.next === workspaceToml.replace('version = "0.1.0" # bumped', 'version = "0.2.0" # bumped'),
      ],
      [
        'a workspace already at the version needs no rewrite',
        tomlRewrite('Cargo.toml', workspaceToml, '0.1.0', '[workspace.package]') === undefined,
      ],
      [
        'a workspace without a [workspace.package] version is refused',
        refusal(
          () => tomlRewrite('Cargo.toml', '[workspace]\nmembers = []\n', '0.2.0', '[workspace.package]'),
          'no version under [workspace.package]',
        ),
      ],
      [
        'a version that is not a plain assignment is refused',
        refusal(
          () => tomlRewrite('Cargo.toml', "[workspace.package]\nversion = '0.1.0'\n", '0.2.0', '[workspace.package]'),
          'not a plain assignment',
        ),
      ],
      [
        'malformed TOML is refused naming the file',
        refusal(
          () => tomlRewrite('bad/Cargo.toml', '[package\n', '0.2.0', '[package]'),
          'bad/Cargo.toml is not valid TOML',
        ),
      ],
      [
        "a member's [package] version moves, not its dependency's version",
        member?.next === memberToml('a', '0.2.0'),
      ],
      [
        'a member inheriting the workspace version needs no rewrite',
        tomlRewrite('crates/b/Cargo.toml', inheritingToml, '0.2.0', '[package]') === undefined,
      ],
      [
        'every workspace member in Cargo.lock moves to the version',
        relocked.next.includes('name = "gritlint"\nversion = "0.2.0"') &&
        relocked.next.includes('name = "gritlint-core"\nversion = "0.2.0"'),
      ],
      [
        'a registry package of the same version keeps its pin',
        relocked.next.includes('name = "serde"\nversion = "1.0.0"\nsource = "registry'),
      ],
      [
        'a member pinned in a shape the rewrite misses is refused',
        refusal(
          () =>
            lockRewrite(
              'Cargo.lock',
              lock.replace(
                'name = "gritlint-core"\nversion = "0.1.0"',
                'name = "gritlint-core"\nversion   =   "0.1.0"',
              ),
              new Set(['gritlint-core']),
              '0.2.0',
            ),
          'still pins gritlint-core below 0.2.0',
        ),
      ],
      [
        'members are the directories under apps/ and crates/, sorted',
        JSON.stringify(paths) ===
          JSON.stringify([join(root, 'apps', 'a', 'Cargo.toml'), join(root, 'crates', 'b', 'Cargo.toml')]),
      ],
      [
        'member names come from each [package] name',
        JSON.stringify([...names].sort()) === JSON.stringify(['app-a', 'inherits']),
      ],
      ['a release version is accepted', assertVersion('1.2.3-rc.1') === '1.2.3-rc.1'],
      ['a version with trailing text is refused', refusal(() => assertVersion('1.2.3\n'), 'invalid version')],
    ]
    const failed = cases.filter(([, ok]) => !ok)
    for (const [name] of failed) console.error(`FAIL ${name}`)
    console.log(`sync-version: selftest ${failed.length === 0 ? 'ok' : 'FAILED'} (${cases.length} tests)`)
    return failed.length === 0 ? 0 : 1
  } finally {
    await Deno.remove(root, { recursive: true })
  }
}

const main = async (args: string[]): Promise<number> => {
  const flags = parseArgs(args, {
    alias: { 'dry-run': 'dryRun' },
    boolean: ['cargo', 'dry-run'],
    string: ['root'],
    unknown: (arg: string) => refuse(`unknown argument: ${arg}`),
  })
  if (flags.root === '') refuse('missing value for --root')
  if (flags.cargo !== true) refuse('pass --cargo (sync the workspace Cargo version)')

  const root = typeof flags.root === 'string' ? resolve(flags.root) : REPO_ROOT
  const carrierPath = join(root, 'npm', 'gritlint', 'package.json')
  const workspaceCargoPath = join(root, 'Cargo.toml')

  const carrierCurrent = await readIfPresent(carrierPath) ?? refuse(`no version carrier at ${carrierPath}`)
  let carrier: { version?: unknown }
  try {
    carrier = JSON.parse(carrierCurrent)
  } catch (error) {
    return refuse(`${carrierPath} is not valid JSON: ${messageOf(error)}`)
  }
  const version = assertVersion(carrier.version)

  const workspaceCargoCurrent = await readIfPresent(workspaceCargoPath) ??
    refuse(`no workspace manifest at ${workspaceCargoPath}; the crates inherit [workspace.package] version from it`)
  const rewrites: Rewrite[] = []
  const workspaceRewrite = tomlRewrite(workspaceCargoPath, workspaceCargoCurrent, version, '[workspace.package]')
  if (workspaceRewrite !== undefined) rewrites.push(workspaceRewrite)

  const members = await memberCargoPaths(root)
  for (const path of members) {
    const current = await readIfPresent(path)
    if (current === undefined) continue
    const rewrite = tomlRewrite(path, current, version, '[package]')
    if (rewrite !== undefined) rewrites.push(rewrite)
  }

  const lockPath = join(root, 'Cargo.lock')
  const lockCurrent = await readIfPresent(lockPath)
  if (lockCurrent !== undefined) rewrites.push(lockRewrite(lockPath, lockCurrent, await memberNames(members), version))

  const dryRun = flags.dryRun === true
  let changed = 0
  for (const rewrite of rewrites) {
    if (rewrite.current === rewrite.next) continue
    changed++
    if (dryRun) {
      console.log(`sync-version: would rewrite ${rewrite.path} -> ${version}`)
      continue
    }
    await Deno.writeTextFile(rewrite.path, rewrite.next)
    console.error(`sync-version: ${rewrite.path} -> ${version}`)
  }

  if (changed === 0) {
    console.error(`sync-version: every surface already at ${version}`)
  } else if (dryRun) {
    console.error(`sync-version: dry run, ${changed} surface(s) would change`)
  }
  return 0
}

if (import.meta.main) {
  try {
    Deno.exit(Deno.args.includes('--selftest') ? await selftest() : await main(Deno.args))
  } catch (error) {
    if (!(error instanceof SyncRefusal)) throw error
    console.error(error.message)
    Deno.exit(1)
  }
}
