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
//   404                      -> debut:     build -> publish -> trust -> list
//   200, no attestation      -> untrusted: trust -> list  (the version exists,
//                               so re-publishing it would be rejected)
//   200, attestation present -> skipped
//
// Chains run concurrently, bounded by --jobs.
//
// Flags: --dry-run --only a,b --jobs N (default 4) --log-level (default info)
// Env:  NPM_REGISTRY overrides the registry base URL.

import { pooledMap } from '@std/async/pool'
import { parseArgs } from '@std/cli/parse-args'
import { ConsoleHandler, getLogger, setup } from '@std/log'
import type { LevelName } from '@std/log'

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

/**
 * Published-ness and OIDC evidence in one read. `attested` is true when the
 * registry's `latest` carries `dist.attestations`, which is the only signal for
 * "this went out through trusted publishing" available without authenticating.
 */
async function registrySnapshot(name: string): Promise<{ published: boolean; attested: boolean }> {
  const response = await fetch(`${registry}/${encodeURIComponent(name)}`, {
    headers: { accept: 'application/json' },
  })
  if (response.status === 404) {
    await response.body?.cancel()
    return { published: false, attested: false }
  }
  if (!response.ok) {
    await response.body?.cancel()
    throw new Error(`${name}: registry returned HTTP ${response.status}`)
  }
  const doc = await response.json() as {
    'dist-tags'?: Record<string, string>
    versions?: Record<string, { dist?: { attestations?: unknown } }>
  }
  const latest = doc['dist-tags']?.['latest']
  if (typeof latest !== 'string') throw new Error(`${name}: registry doc carries no dist-tags.latest`)
  return { published: true, attested: doc.versions?.[latest]?.dist?.attestations != null }
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

async function publishAndTrust(
  p: { name: string; path: string; mode: 'debut' | 'untrusted' },
): Promise<{ name: string; ok: boolean }> {
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

const snapshots = await Promise.all(rows.map((p) => registrySnapshot(p.name)))
const owed: Array<{ name: string; path: string; mode: 'debut' | 'untrusted' }> = []
for (let i = 0; i < rows.length; i++) {
  const p = rows[i]
  const { published, attested } = snapshots[i]
  if (!published) {
    log.info(`${p.name} … unpublished (404) — debut`)
    owed.push({ ...p, mode: 'debut' })
  } else if (!attested) {
    log.info(`${p.name} … published, no provenance attestation — registering trusted publisher`)
    owed.push({ ...p, mode: 'untrusted' })
  } else {
    log.info(`${p.name} … published + attested — skipped`)
  }
}

if (owed.length === 0) {
  log.info('every package is published and attested — nothing to do')
  Deno.exit(0)
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
if (failed.length > 0) {
  log.error(`failed: ${failed.join(', ')}`)
  Deno.exit(1)
}
log.info('\ndone')
