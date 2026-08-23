#!/usr/bin/env -S deno run --allow-run=git,corepack,pnpm,npm --allow-read --allow-env=NPM_REGISTRY --allow-net=registry.npmjs.org
// publish-and-setup-npm-trust.ts — bring every non-private workspace package to
// the state CI needs: published on npm AND carrying a registered trusted
// publisher (OIDC).
//
// Existing on the registry is not that state. A package published from a
// maintainer machine, or published before its trusted publisher was registered,
// answers HTTP 200 while its latest version carries no provenance attestation —
// so keying the skip on the status code alone declares the bootstrap finished on
// exactly the packages that still need it, and the release pipeline then meets
// them as `no-oidc` forever. The skip is keyed on the attestation instead:
//
//   unpublished (404)        -> debut:     build -> publish -> trust -> list
//   published, no attestation-> untrusted: trust -> list  (the version exists,
//                               so re-publishing it would be rejected)
//   published + attested     -> skipped
//   unreadable registry      -> named, and the run ends non-zero
//
// An untrusted package does not become attested by being registered: an
// attestation is stamped at publish time and never granted retroactively, so its
// already-published version stays unattested until its next version ships from
// CI (docs/solutions/tooling-decisions/first-publish-under-oidc-trusted-publishing.md,
// "The debut version carries no provenance attestation"). Re-running therefore
// picks the same package up again, and `npm trust github` is idempotent so that
// is safe. Registration is the state this script converges; attestation is the
// release pipeline's to produce.
//
// Chains run concurrently, bounded by --jobs.
//
// Flags: --dry-run --only a,b --jobs N (default 4) --log-level (default info)
// Env:  NPM_REGISTRY overrides the registry base URL.

import { pooledMap } from '@std/async/pool'
import { parseArgs } from '@std/cli/parse-args'
import { ConsoleHandler, getLogger, setup } from '@std/log'
import type { LevelName } from '@std/log'
import { queryRegistry } from './npm-query.ts'

const {
  'dry-run': dryRun = false,
  'log-level': logLevelArg = 'info',
  jobs: jobsArg,
  only: onlyArg,
} = parseArgs(Deno.args, {
  boolean: ['dry-run'],
  string: ['only', 'log-level', 'jobs'],
  alias: { o: 'only' },
  default: { 'dry-run': false, 'log-level': 'info', jobs: '4' },
})

const jobs = Math.max(1, Number(jobsArg) || 4)

const logLevel = logLevelArg.toUpperCase() as LevelName
const only = new Set((onlyArg ?? '').split(',').map((s) => s.trim()).filter(Boolean))

await setup({
  handlers: {
    console: new ConsoleHandler(logLevel, {
      formatter: (record) => {
        const level = record.levelName.toLowerCase()
        return level === 'info' ? String(record.msg) : `${level.toUpperCase()}: ${record.msg}`
      },
    }),
  },
  loggers: {
    default: { level: logLevel, handlers: ['console'] },
  },
})

const log = getLogger()

const repoRoot = new TextDecoder().decode(
  new Deno.Command('git', { args: ['rev-parse', '--show-toplevel'] }).outputSync().stdout,
).trim()
const registry = Deno.env.get('NPM_REGISTRY') ?? 'https://registry.npmjs.org'

function runCapture(args: string[], cwd?: string): { ok: boolean; stdout: string; stderr: string } {
  const cmd = new Deno.Command(args[0], {
    args: args.slice(1),
    cwd,
    stdout: 'piped',
    stderr: 'piped',
  })
  const res = cmd.outputSync()
  return {
    ok: res.success,
    stdout: new TextDecoder().decode(res.stdout),
    stderr: new TextDecoder().decode(res.stderr),
  }
}

function remoteSlug(): string {
  const src = runCapture(['git', '-C', repoRoot, 'remote', 'get-url', 'origin'])
  if (!src.ok) throw new Error(`cannot read origin remote: ${src.stderr.trim()}`)
  for (const re of [/^[^:]+:([^/]+)\/([^/]+?)(\.git)?$/m, /^https?:\/\/[^/]+\/([^/]+)\/([^/]+?)(\.git)?$/m]) {
    const m = src.stdout.trim().match(re)
    if (m) return `${m[1]}/${m[2]}`
  }
  throw new Error(`cannot parse origin remote: ${src.stdout.trim()}`)
}

function workspaceRows(): Array<{ name: string; path: string }> {
  const res = runCapture(['pnpm', 'ls', '-r', '--depth=-1', '--json'], repoRoot)
  if (!res.ok) throw new Error(`pnpm ls failed:\n${res.stderr}`)
  const tree = JSON.parse(res.stdout) as Array<{ name: string; path: string; private?: boolean }>
  return (tree ?? []).filter((p) => p.private !== true).map((p) => ({ name: p.name, path: p.path }))
}

async function runInteractive(args: string[], cwd: string): Promise<boolean> {
  const child = new Deno.Command(args[0], {
    args: args.slice(1),
    cwd,
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  }).spawn()
  return (await child.status).success
}

async function hasBuildScript(packagePath: string): Promise<boolean> {
  try {
    const manifestPath = `${packagePath}/package.json`
    const raw = await Deno.readTextFile(manifestPath)
    const manifest = JSON.parse(raw) as { scripts?: Record<string, string> }
    return typeof manifest.scripts?.build === 'string'
  } catch {
    return false
  }
}

/** One package's outstanding bootstrap work, and how much of the chain it needs. */
interface Owed {
  readonly name: string
  readonly path: string
  readonly mode: 'debut' | 'untrusted'
}

async function publishAndTrust(p: Owed): Promise<{ name: string; ok: boolean }> {
  const name = p.name
  const seq: Array<Array<string>> = []
  // An untrusted package is already on the registry at this version, so only the
  // registration is missing. Publishing it again would be rejected.
  if (p.mode === 'debut') {
    if (await hasBuildScript(p.path)) {
      seq.push(['corepack', 'pnpm', '--filter', name, 'build'])
    }
    seq.push(['corepack', 'pnpm', '--filter', name, 'publish', '--access', 'public', '--no-git-checks'])
  }
  seq.push(
    ['npm', 'trust', 'github', name, '--repo', slug, '--file', 'release.yml', '--allow-publish', '--yes'],
    ['npm', 'trust', 'list', name],
  )

  log.info(`\n== ${name} (${p.mode})`)
  for (const args of seq) {
    log.info(`  > ${args.join(' ')}`)
    if (dryRun) continue
    if (!(await runInteractive(args, p.path))) {
      log.error(`  FAILED: ${args.join(' ')}`)
      return { name, ok: false }
    }
  }
  return { name, ok: true }
}

const rows = workspaceRows().filter((p) => only.size === 0 || only.has(p.name))
const slug = remoteSlug()

// An `--only` that matches nothing would otherwise reach the "everything is
// published and attested" branch below having queried no package at all, and
// report a clean bootstrap on the strength of a typo.
if (rows.length === 0) {
  log.error(
    only.size > 0
      ? `--only matched no workspace package: ${[...only].join(', ')}`
      : 'no non-private workspace packages discovered (did `pnpm ls -r` fail?)',
  )
  Deno.exit(1)
}

// Bounded, because an unbounded map over every member is an fd and rate-limit
// hazard. `queryRegistry` never throws, so one unreadable package is reported
// alongside the rest instead of aborting the run and discarding every other
// answer; `pooledMap` yields in input order, so a snapshot still pairs with its
// row by index.
const snapshots = await Array.fromAsync(pooledMap(jobs, rows, (p) => queryRegistry(p.name, registry)))
const owed: Owed[] = []
const unreadable: string[] = []
for (let i = 0; i < rows.length; i++) {
  const p = rows[i]
  const snapshot = snapshots[i]
  if (snapshot.status === 'error') {
    log.error(`${p.name} … registry unreadable — cannot tell whether it is published`)
    unreadable.push(p.name)
  } else if (snapshot.status === 'unpublished') {
    log.info(`${p.name} … unpublished (404) — debut`)
    owed.push({ ...p, mode: 'debut' })
  } else if (!snapshot.attested) {
    log.info(`${p.name} … published ${snapshot.latest}, no provenance attestation — registering trusted publisher`)
    owed.push({ ...p, mode: 'untrusted' })
  } else {
    log.info(`${p.name} … published ${snapshot.latest} + attested — skipped`)
  }
}

if (owed.length === 0) {
  log.info(
    unreadable.length > 0
      ? 'no package has outstanding work, but the registry could not be read for some'
      : 'every package is published and attested — nothing to do',
  )
  Deno.exit(unreadable.length > 0 ? 1 : 0)
}

const debuts = owed.filter((p) => p.mode === 'debut').length
log.info('')
log.info(
  `processing ${owed.length} package(s) with --jobs ${jobs}: ${debuts} debut, ${owed.length - debuts} untrusted`,
)
const results: Array<{ name: string; ok: boolean }> = await Array.fromAsync(
  pooledMap(jobs, owed, publishAndTrust),
)
const failed = results.filter((r) => !r.ok).map((r) => r.name)
if (failed.length > 0) log.error(`failed: ${failed.join(', ')}`)
if (unreadable.length > 0) log.error(`registry unreadable: ${unreadable.join(', ')}`)
if (failed.length > 0 || unreadable.length > 0) Deno.exit(1)
log.info('\ndone')
