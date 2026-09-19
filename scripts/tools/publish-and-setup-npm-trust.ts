#!/usr/bin/env -S deno run --allow-run=git,corepack,pnpm,npm --allow-read --allow-write --allow-env=NPM_REGISTRY,GITHUB_REPOSITORY --allow-net=registry.npmjs.org
// publish-and-setup-npm-trust.ts — bring every non-private workspace package to
// the state CI needs: published on npm AND carrying a trusted publisher (OIDC).
//
// Existing on the registry is not that state. A package published from a
// maintainer machine, or published before its trusted publisher was registered,
// answers HTTP 200 while its latest version carries no provenance attestation —
// so keying the skip on the status code alone declares the bootstrap finished on
// exactly the packages that still need it, and the release pipeline then meets
// them as unattested forever. The skip is keyed on the attestation instead:
//
//   unpublished (404)         -> debut:     build -> publish -> trust -> list
//   published, no attestation -> untrusted: trust -> list  (the version exists,
//                                so re-publishing it would be rejected)
//   published + attested      -> skipped
//   unreadable registry       -> named, and the run ends non-zero
//
// An untrusted package does not become attested by being registered: an
// attestation is stamped at publish time and never granted retroactively, so its
// already-published version stays unattested until its next version ships from
// CI. Re-running therefore picks the same package up again, and
// `npm trust github` is idempotent, so that is safe.
//
// Chains run concurrently, bounded by --jobs.
//
// Flags: --dry-run --only a,b --jobs N (default 4) --fix --all-trust
// Env:  NPM_REGISTRY overrides the registry base URL.

import { pooledMap } from '@std/async/pool'
import { parseArgs } from '@std/cli/parse-args'
import { queryRegistry } from './npm-query.ts'
import { expectedSlug, publicWorkspacePackages, WORKFLOW_FILE } from './oidc.ts'

const {
  'dry-run': dryRun = false,
  jobs: jobsArg = '1',
  only: onlyArg,
  fix: fixRepo = false,
  'all-trust': allTrust = false,
} = parseArgs(Deno.args, {
  boolean: ['dry-run', 'fix', 'all-trust'],
  string: ['only', 'jobs'],
  alias: { o: 'only' },
  default: { 'dry-run': false, jobs: '1', 'all-trust': false },
})

const jobs = Math.max(1, Number(jobsArg) || 4)
const only = new Set((onlyArg ?? '').split(',').map((s) => s.trim()).filter(Boolean))
const targetSlug = await expectedSlug()
const registry = Deno.env.get('NPM_REGISTRY') ?? 'https://registry.npmjs.org'

console.log(`Repository target slug: ${targetSlug}`)
console.log(`Workflow file: ${WORKFLOW_FILE}`)

const allPackages = await publicWorkspacePackages()
if (fixRepo) {
  for (const pkg of allPackages) {
    if (pkg.repositorySlug !== targetSlug) {
      const content = await Deno.readTextFile(pkg.filePath)
      const parsed = JSON.parse(content)
      if (typeof parsed.repository === 'object' && parsed.repository !== null) {
        parsed.repository.url = `git+https://github.com/${targetSlug}.git`
      } else {
        parsed.repository = `git+https://github.com/${targetSlug}.git`
      }
      await Deno.writeTextFile(pkg.filePath, JSON.stringify(parsed, null, 2) + '\n')
      console.log(`Updated repository.url for ${pkg.name}`)
    }
  }
}

const rows = allPackages.filter((p) => only.size === 0 || only.has(p.name))
if (rows.length === 0) {
  console.error(
    only.size > 0
      ? `--only matched no workspace package: ${[...only].join(', ')}`
      : 'no non-private workspace packages discovered',
  )
  Deno.exit(1)
}

interface Owed {
  readonly name: string
  readonly dir: string
  readonly mode: 'debut' | 'untrusted'
}

// Bounded, because an unbounded map over every member is an fd and rate-limit
// hazard. `queryRegistry` never throws, and `pooledMap` yields in input order,
// so a snapshot still pairs with its row by index.
const snapshots = await Array.fromAsync(pooledMap(jobs, rows, (p) => queryRegistry(p.name, registry)))
const owed: Owed[] = []
const unreadable: string[] = []

for (let i = 0; i < rows.length; i++) {
  const p = rows[i]
  const dir = p.filePath.replace(/\/package\.json$/, '')
  const snapshot = snapshots[i]
  if (snapshot.status === 'error') {
    console.error(`${p.name} … registry unreadable`)
    unreadable.push(p.name)
  } else if (snapshot.status === 'unpublished') {
    console.log(`${p.name} … unpublished (404) — debut`)
    owed.push({ name: p.name, dir, mode: 'debut' })
  } else if (!snapshot.attested) {
    console.log(`${p.name} … published ${snapshot.latest}, no provenance attestation — registering trusted publisher`)
    owed.push({ name: p.name, dir, mode: 'untrusted' })
  } else if (allTrust) {
    console.log(`${p.name} … published ${snapshot.latest} + attested — re-applying trusted publisher (--all-trust)`)
    owed.push({ name: p.name, dir, mode: 'untrusted' })
  } else {
    console.log(`${p.name} … published ${snapshot.latest} + attested — skipped (use --all-trust to force trust update)`)
  }
}
if (owed.length === 0) {
  console.log(
    unreadable.length > 0
      ? 'no package has outstanding work, but the registry could not be read for some'
      : 'every package is published and attested — nothing to do',
  )
  Deno.exit(unreadable.length > 0 ? 1 : 0)
}

async function runInteractive(args: string[], cwd: string): Promise<{ success: boolean; code: number }> {
  const child = new Deno.Command(args[0], {
    args: args.slice(1),
    cwd,
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  }).spawn()
  const status = await child.status
  return { success: status.success, code: status.code }
}

type TrustConfig = {
  id?: string
  type?: string
  file?: string
  repository?: string
}

/** Trust configs from `npm trust list --json`, tolerant of surrounding prose. */
function parseTrustJson(raw: string): TrustConfig[] {
  const configs: TrustConfig[] = []
  let depth = 0
  let start = -1
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === '{') {
      if (depth === 0) start = i
      depth++
    } else if (raw[i] === '}') {
      depth--
      if (depth === 0 && start !== -1) {
        const slice = raw.slice(start, i + 1)
        try {
          const parsed = JSON.parse(slice)
          if (Array.isArray(parsed)) configs.push(...(parsed as TrustConfig[]))
          else if (parsed && typeof parsed === 'object') configs.push(parsed as TrustConfig)
        } catch {
          // ignore parse errors
        }
        start = -1
      }
    }
  }
  return configs
}

async function getTrustConfigs(pkgName: string, cwd: string): Promise<TrustConfig[]> {
  const out = await new Deno.Command('npm', {
    args: ['trust', 'list', pkgName, '--json'],
    cwd,
    stdin: 'inherit',
    stdout: 'piped',
    stderr: 'inherit',
  }).output()
  if (out.success) {
    return parseTrustJson(new TextDecoder().decode(out.stdout))
  }
  return []
}

/** Converge a package's trust config on exactly this repo + workflow file. */
async function reconcileTrust(pkgName: string, cwd: string, dryRun: boolean): Promise<boolean> {
  const matchesTarget = (cfg: TrustConfig) =>
    cfg.type === 'github' && cfg.repository === targetSlug && cfg.file === WORKFLOW_FILE

  console.log(`  Querying trust configuration for ${pkgName}...`)
  const existing = await getTrustConfigs(pkgName, cwd)

  if (existing.some(matchesTarget)) {
    for (const cfg of existing.filter((c) => !matchesTarget(c))) {
      if (!cfg.id) continue
      console.log(`  Cleaning up stale config ${cfg.id} (${cfg.repository ?? 'other repo'})`)
      if (!dryRun) {
        await runInteractive(['npm', 'trust', 'revoke', pkgName, `--id=${cfg.id}`], cwd)
      }
    }
    console.log(`  Already trusted for ${targetSlug} (${WORKFLOW_FILE}) — no changes needed`)
    return true
  }

  for (const cfg of existing) {
    if (!cfg.id) continue
    console.log(`  Revoking non-matching config ${cfg.id} (${cfg.repository ?? 'unknown'})`)
    if (!dryRun) {
      const res = await runInteractive(['npm', 'trust', 'revoke', pkgName, `--id=${cfg.id}`], cwd)
      if (!res.success) {
        console.error(`  Failed to revoke existing trust id ${cfg.id}`)
        return false
      }
    }
  }

  const addCmd = [
    'npm',
    'trust',
    'github',
    pkgName,
    '--repo',
    targetSlug,
    '--file',
    WORKFLOW_FILE,
    '--allow-publish',
    '--allow-stage-publish',
    '--yes',
  ]
  console.log(`  > ${addCmd.join(' ')}`)
  if (!dryRun) {
    const res = await runInteractive(addCmd, cwd)
    if (!res.success) {
      console.error(`  FAILED: ${addCmd.join(' ')}`)
      return false
    }
  }
  return true
}

async function hasBuildScript(packagePath: string): Promise<boolean> {
  try {
    const raw = await Deno.readTextFile(`${packagePath}/package.json`)
    const manifest = JSON.parse(raw) as { scripts?: Record<string, string> }
    return typeof manifest.scripts?.build === 'string'
  } catch {
    return false
  }
}

async function publishAndTrust(p: Owed): Promise<{ name: string; ok: boolean }> {
  const name = p.name
  console.log(`\n== ${name} (${p.mode})`)
  if (p.mode === 'debut') {
    if (await hasBuildScript(p.dir)) {
      console.log(`  > corepack pnpm --filter ${name} build`)
      if (!dryRun && !(await runInteractive(['corepack', 'pnpm', '--filter', name, 'build'], p.dir)).success) {
        return { name, ok: false }
      }
    }
    console.log(`  > corepack pnpm --filter ${name} publish --access public --no-git-checks`)
    if (
      !dryRun &&
      !(await runInteractive(
        ['corepack', 'pnpm', '--filter', name, 'publish', '--access', 'public', '--no-git-checks'],
        p.dir,
      )).success
    ) {
      return { name, ok: false }
    }
  }

  if (!(await reconcileTrust(name, p.dir, dryRun))) return { name, ok: false }

  console.log(`  > npm trust list ${name}`)
  if (!dryRun) {
    await runInteractive(['npm', 'trust', 'list', name], p.dir)
  }
  return { name, ok: true }
}

const debuts = owed.filter((p) => p.mode === 'debut').length
console.log(
  `\nprocessing ${owed.length} package(s) with --jobs ${jobs}: ${debuts} debut, ${owed.length - debuts} untrusted`,
)

const results: Array<{ name: string; ok: boolean }> = await Array.fromAsync(
  pooledMap(jobs, owed, publishAndTrust),
)

const failed = results.filter((r) => !r.ok).map((r) => r.name)
if (failed.length > 0) console.error(`failed: ${failed.join(', ')}`)
if (unreadable.length > 0) console.error(`registry unreadable: ${unreadable.join(', ')}`)
if (failed.length > 0 || unreadable.length > 0) Deno.exit(1)
console.log('\ndone')
