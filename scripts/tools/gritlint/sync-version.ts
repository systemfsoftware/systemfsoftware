#!/usr/bin/env -S deno run --allow-read --allow-write
import { join, resolve } from '@std/path'
import { parse as parseToml } from '@std/toml'
import {
  assertVersion,
  die,
  type LauncherManifest,
  parseCliArgs,
  readTargets,
  REPO_ROOT,
  type Target,
} from './shared.ts'

type TomlHeader = '[workspace.package]' | '[package]'

interface TomlDocument {
  workspace?: { package?: { version?: unknown } }
  package?: { name?: unknown; version?: unknown }
}

type JsonDocument = Record<string, unknown>

interface Rewrite {
  path: string
  current: string
  next: string
}

const flags = parseCliArgs({
  alias: { 'dry-run': 'dryRun' },
  boolean: ['cargo', 'pins', 'dry-run'],
  string: ['root'],
})
const cargo = flags.cargo === true
const pins = flags.pins === true
const dryRun = flags.dryRun === true

if (!cargo && !pins) {
  die('sync-version: pass --cargo (Cargo.toml version) and/or --pins (launcher optionalDependencies)')
}

const root = typeof flags.root === 'string' ? resolve(flags.root) : REPO_ROOT
const launcherPath = join(root, 'npm', 'gritlint', 'package.json')
const workspaceCargoPath = join(root, 'Cargo.toml')

const readIfPresent = async (path: string): Promise<string | undefined> => {
  try {
    return await Deno.readTextFile(path)
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return undefined
    throw error
  }
}

const parseJsonOrDie = <T>(text: string, path: string): T => {
  try {
    return JSON.parse(text) as T
  } catch (error) {
    return die(
      `sync-version: ${path} is not valid JSON: ${error instanceof Error ? error.message : error}`,
    )
  }
}

const parseTomlOrDie = (text: string, path: string): TomlDocument => {
  try {
    return parseToml(text) as TomlDocument
  } catch (error) {
    return die(
      `sync-version: ${path} is not valid TOML: ${error instanceof Error ? error.message : error}`,
    )
  }
}

const jsonRewrite = (
  path: string,
  current: string,
  mutate: (doc: JsonDocument) => void,
): Rewrite => {
  const doc = parseJsonOrDie<JsonDocument>(current, path)
  mutate(doc)
  return { path, current, next: `${JSON.stringify(doc, null, 2)}\n` }
}

// The version assignment is replaced in place: re-stringifying the whole TOML
// document would rewrite unrelated formatting (lint levels, profiles, comments).
const tomlRewrite = (
  path: string,
  current: string,
  version: string,
  header: TomlHeader,
): Rewrite | undefined => {
  const parsed = parseTomlOrDie(current, path)
  const section = header === '[workspace.package]' ? parsed.workspace?.package : parsed.package
  const found: unknown = section?.version
  if (typeof found !== 'string') {
    if (header === '[package]') return undefined // the member inherits `version.workspace = true`
    return die(`sync-version: no version under ${header} in ${path}`)
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
    return die(`sync-version: ${path} has a version under ${header} that is not a plain assignment`)
  }
  const next = lines.join('\n')
  const after = header === '[workspace.package]'
    ? parseTomlOrDie(next, path).workspace?.package?.version as unknown
    : parseTomlOrDie(next, path).package?.version as unknown
  if (after !== version) {
    return die(`sync-version: rewriting ${header} in ${path} did not take (${String(after)})`)
  }
  return { path, current, next }
}

/** Member crates that pin a literal version instead of inheriting the workspace one. */
const memberCargoPaths = async (): Promise<string[]> => {
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

const memberNames = async (paths: string[]): Promise<Set<string>> => {
  const names = new Set<string>()
  for (const path of paths) {
    const current = await readIfPresent(path)
    if (current === undefined) continue
    const name: unknown = parseTomlOrDie(current, path).package?.name
    if (typeof name === 'string') names.add(name)
  }
  return names
}

// A workspace member's own `[[package]]` entry carries no `source` line. Its
// version must follow the manifest, or `cargo --locked` (the nix build) refuses
// the lock after a release bump.
const lockRewrite = (path: string, current: string, names: Set<string>, version: string): Rewrite => {
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
    return die(`sync-version: ${path} still pins ${stale.join(', ')} below ${version}`)
  }
  return { path, current, next }
}

const launcherCurrent = await readIfPresent(launcherPath)
if (launcherCurrent === undefined) {
  die(`sync-version: no launcher manifest at ${launcherPath}`)
}
const launcher = parseJsonOrDie<LauncherManifest>(launcherCurrent, launcherPath)
const version = assertVersion(launcher.version)

const rewrites: Rewrite[] = []

if (pins) {
  const targets: Target[] = await readTargets()
  rewrites.push(
    jsonRewrite(launcherPath, launcherCurrent, (doc) => {
      doc.optionalDependencies = Object.fromEntries(
        targets.map((entry) => [`${launcher.name}-${entry.suffix}`, version]),
      )
    }),
  )
}

if (cargo) {
  const workspaceCargoCurrent = await readIfPresent(workspaceCargoPath)
  if (workspaceCargoCurrent === undefined) {
    die(
      `sync-version: no workspace manifest at ${workspaceCargoPath}; the crates inherit [workspace.package] version from it`,
    )
  }
  const workspaceRewrite = tomlRewrite(
    workspaceCargoPath,
    workspaceCargoCurrent,
    version,
    '[workspace.package]',
  )
  if (workspaceRewrite !== undefined) rewrites.push(workspaceRewrite)

  const members = await memberCargoPaths()
  for (const path of members) {
    const current = await readIfPresent(path)
    if (current === undefined) continue
    const rewrite = tomlRewrite(path, current, version, '[package]')
    if (rewrite !== undefined) rewrites.push(rewrite)
  }

  const lockPath = join(root, 'Cargo.lock')
  const lockCurrent = await readIfPresent(lockPath)
  if (lockCurrent !== undefined) rewrites.push(lockRewrite(lockPath, lockCurrent, await memberNames(members), version))
}

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
