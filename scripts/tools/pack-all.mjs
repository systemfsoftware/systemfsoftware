#!/usr/bin/env node
// Packs every publishable workspace package into one directory outside the repo
// and checks what actually landed in each tarball.
//
// `pnpm pack` is the only place the published shape becomes observable: it is
// where `workspace:^` and `catalog:` resolve to real ranges, where `files` and
// `publishConfig.exports` take effect, and where a missing README or LICENSE
// stops being a file nobody looked at and becomes what a consumer downloads. So
// the assertions here read the tarball, never the source manifest.
//
// Usage:
//   node scripts/tools/pack-all.mjs [--out <dir>] [--json | --json-out <file>]
//
// Prints the pack directory on the last line so a caller can consume it.

import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('../../', import.meta.url)).replace(/\/$/, '')

const REQUIRED_ENTRIES = ['package/package.json', 'package/README.md', 'package/LICENSE']

// Development files that must never reach a consumer. The lint config is the one
// that bites: oxlint discovers nested configs by walking directories, so a
// published `oxlint.config.ts` under `node_modules` is loaded by the consumer's
// own lint run and fails it — the config imports dev-only packages, and Node
// refuses to strip types under `node_modules` regardless. A package with no
// `files` field publishes all of these by default.
const LEAKED_DEV_FILES =
  /^package\/(oxlint\.config\.|vitest[\w.-]*\.config\.|tsdown\.config\.|stryker\.config\.|tsconfig[\w.-]*\.json|api-extractor|\.attw\.json|AGENTS\.md|turbo\.json|tests?\/|etc\/)/

const arg = (flag) => {
  const i = process.argv.indexOf(flag)
  return i === -1 ? undefined : process.argv[i + 1]
}

const run = (cmd, args, cwd = repoRoot) =>
  execFileSync(cmd, args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })

/** Workspace membership is the authority on what ships; `private` is the only exclusion. */
const publishablePackages = () =>
  JSON.parse(run('pnpm', ['ls', '-r', '--json', '--depth=-1']))
    .filter((pkg) => typeof pkg.name === 'string' && pkg.private !== true && pkg.path !== repoRoot)
    .map((pkg) => ({ name: pkg.name, dir: pkg.path }))
    .sort((a, b) => a.name.localeCompare(b.name))

const tarballEntries = (tarball) => run('tar', ['-tzf', tarball]).split('\n').filter((l) => l.length > 0)

/**
 * Every file a consumer's `import` can reach, taken from the published exports
 * map rather than from `main`: `publishConfig.exports` is what npm writes into
 * the tarball's manifest, and it is the only map that omits this repo's
 * `@systemfsoftware/source` development condition.
 *
 * A package need not export `.`: `tsconfig` and `stryker-js-plugin-api` publish
 * only subpaths, and treating a missing root as "no import surface" reported
 * them as bin-less libraries rather than checking the files they do ship.
 */
const publishedEntries = (manifest) => {
  const entries = []
  for (const [subpath, value] of Object.entries(manifest.exports ?? {})) {
    if (subpath === './package.json') continue
    if (typeof value === 'string') {
      entries.push(value)
      continue
    }
    if (typeof value !== 'object' || value === null) continue
    const candidate = value.default ?? value.types
    if (typeof candidate === 'string') entries.push(candidate)
  }
  return entries
}

const main = () => {
  const outDir = arg('--out') ?? mkdtempSync(path.join(tmpdir(), 'systemfsoftware-pack-'))
  if (outDir.startsWith(repoRoot)) {
    console.error(
      `pack-all: refusing to pack into the repository (${outDir}) — a consumer install must resolve nothing from here`,
    )
    process.exit(1)
  }

  const packages = publishablePackages()
  const findings = []
  const packed = []

  for (const pkg of packages) {
    try {
      run('pnpm', ['--filter', pkg.name, 'pack', '--pack-destination', outDir])
    } catch (error) {
      findings.push(`${pkg.name}: pack failed — ${String(error).split('\n')[0]}`)
      continue
    }
  }

  const tarballs = readdirSync(outDir).filter((f) => f.endsWith('.tgz'))
  if (tarballs.length !== packages.length) {
    findings.push(`expected ${packages.length} tarball(s), found ${tarballs.length}`)
  }

  for (const tarball of tarballs) {
    const full = path.join(outDir, tarball)
    const entries = tarballEntries(full)
    const manifest = JSON.parse(run('tar', ['-xzOf', full, 'package/package.json']))

    for (const required of REQUIRED_ENTRIES) {
      if (!entries.includes(required)) findings.push(`${manifest.name}: tarball is missing ${required}`)
    }

    const leaked = entries.filter((entry) => LEAKED_DEV_FILES.test(entry))
    if (leaked.length > 0) {
      const kinds = [...new Set(leaked.map((e) => e.replace('package/', '').split('/')[0]))]
      findings.push(
        `${manifest.name}: publishes ${leaked.length} development file(s) — ${
          kinds.slice(0, 6).join(', ')
        }; declare a \`files\` field`,
      )
    }

    const exportEntries = publishedEntries(manifest)
    const bin = manifest.bin
    const binPaths = (typeof bin === 'string' ? [bin] : Object.values(bin ?? {})).map(String)

    if (exportEntries.length === 0 && binPaths.length === 0) {
      findings.push(`${manifest.name}: publishes neither an exports entry nor a bin`)
    }
    for (const entry of exportEntries) {
      const inTarball = `package/${entry.replace(/^\.\//, '')}`
      if (!entries.includes(inTarball)) findings.push(`${manifest.name}: exports entry ${entry} is not in the tarball`)
    }
    for (const binPath of binPaths) {
      const inTarball = `package/${binPath.replace(/^\.\//, '')}`
      if (!entries.includes(inTarball)) findings.push(`${manifest.name}: bin ${binPath} is not in the tarball`)
    }

    for (const [name, spec] of Object.entries({ ...manifest.dependencies, ...manifest.peerDependencies })) {
      if (String(spec).startsWith('workspace:') || String(spec).startsWith('catalog:')) {
        findings.push(`${manifest.name}: ${name} published as '${spec}' — a consumer cannot resolve that protocol`)
      }
    }

    packed.push({
      name: manifest.name,
      version: manifest.version,
      tarball: full,
      entries: exportEntries,
      bins: binPaths,
    })
  }

  if (findings.length > 0) {
    console.error(`pack-all: ${findings.length} finding(s)\n`)
    for (const finding of findings) console.error(`  ${finding}`)
    process.exit(1)
  }

  // A caller that needs the manifest gets it in a file it named. Stdout carries
  // the packer's own progress interleaved with every `pnpm pack` it spawns, so a
  // machine-readable payload written there is only parseable by luck.
  const manifestOut = arg('--json-out')
  if (manifestOut !== undefined) {
    writeFileSync(manifestOut, `${JSON.stringify({ outDir, packed }, null, 2)}\n`)
    console.log(`pack-all: ${packed.length} package(s) packed clean; manifest written to ${manifestOut}`)
    return
  }

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ outDir, packed }, null, 2))
    return
  }

  console.log(
    `pack-all: ${packed.length} package(s) packed clean — README, LICENSE, manifest and published entry present in each`,
  )
  console.log(outDir)
}

main()
