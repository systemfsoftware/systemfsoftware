#!/usr/bin/env -S deno run --allow-run=git,corepack,pnpm,npm --allow-env=NPM_REGISTRY --allow-net=registry.npmjs.org
// publish-and-setup-npm-trust.ts — publish every unpublished non-private workspace
// package, then register the npm trusted publisher (OIDC) for each one.
//
// Per package: build -> publish (debuts can't use OIDC: npm-trust requires the
// package to exist) -> npm trust github ... -> npm trust list. Chains run
// concurrently, bounded by --jobs.
//
// Flags: --dry-run --only a,b --jobs N (default 4) --log-level (default info)
// Env:  NPM_REGISTRY overrides the registry base URL.

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

async function registryStatus(name: string): Promise<number> {
  return (await fetch(`${registry}/${encodeURIComponent(name)}`, { method: 'HEAD' })).status
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

async function publishAndTrust(p: { name: string; path: string }): Promise<boolean> {
  const name = p.name
  const seq: Array<Array<string>> = [
    ['corepack', 'pnpm', '--filter', name, 'build'],
    ['corepack', 'pnpm', '--filter', name, 'publish', '--access', 'public', '--no-git-checks'],
    ['npm', 'trust', 'github', name, '--repo', slug, '--file', 'release.yml', '--allow-publish', '--yes'],
    ['npm', 'trust', 'list', name],
  ]

  log.info(`\n== ${name}`)
  for (const args of seq) {
    log.info(`  > ${args.join(' ')}`)
    if (dryRun) continue
    if (!(await runInteractive(args, p.path))) {
      log.error(`  FAILED: ${args.join(' ')}`)
      return false
    }
  }
  return true
}

/** Bounded-concurrency map: at most `limit` `fn` calls in flight, results in input order. */
async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<boolean>): Promise<boolean[]> {
  const results = new Array<boolean>(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++
      if (i >= items.length) return
      results[i] = await fn(items[i])
    }
  })
  await Promise.all(workers)
  return results
}

const rows = workspaceRows().filter((p) => only.size === 0 || only.has(p.name))
const slug = remoteSlug()

const statuses = await Promise.all(rows.map((p) => registryStatus(p.name)))
const unpublished: Array<{ name: string; path: string }> = []
for (let i = 0; i < rows.length; i++) {
  const p = rows[i]
  const status = statuses[i]
  log.info(`${p.name} … ${status === 404 ? 'unpublished (404)' : `published (HTTP ${status}) — skipped`}`)
  if (status === 404) unpublished.push(p)
}

if (unpublished.length === 0) {
  log.info('nothing to publish')
  Deno.exit(0)
}

log.info('')
log.info(`publishing ${unpublished.length} package(s) with --jobs ${jobs}:`)
const pub = await mapLimit(unpublished, jobs, publishAndTrust)
const failed = unpublished.filter((_, i) => !pub[i]).map((p) => p.name)
if (failed.length > 0) {
  log.error(`failed: ${failed.join(', ')}`)
  Deno.exit(1)
}
log.info('\ndone')
