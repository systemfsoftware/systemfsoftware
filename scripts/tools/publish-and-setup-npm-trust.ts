#!/usr/bin/env -S deno run --allow-run=git,corepack,pnpm,npm --allow-env=NPM_REGISTRY --allow-net=registry.npmjs.org
// publish-and-setup-npm-trust.ts — publish every unpublished non-private workspace
// package, then register the npm trusted publisher (OIDC) for each one just published.
//
// Discovery and classification mirror scripts/tools/check-npm-publish.sh:
//   1. `pnpm ls -r --depth=-1 --json`, keep packages with `private != true`.
//   2. HEAD the npm registry; 404 = never published.
//   3. For each unpublished package, in order:
//        corepack pnpm --filter <pkg> build
//        corepack pnpm --filter <pkg> publish --access public --no-git-checks
//        npm trust github <pkg> --repo <slug> --file release.yml --allow-publish --yes
//        npm trust list <pkg>
//
// The order is forced: npm-trust's prerequisites require the package to already
// exist on the registry ("Package must exist"), so a debut publish can never use
// OIDC and the trusted publisher can only be registered AFTER the package lands.
// A publish or trust failure stops the run (non-zero exit); no trust runs for a
// package that did not publish.
//
// Flags:
//   --dry-run    print the exact commands, change nothing on npm.
//   --only a,b   limit to the named packages.
//
// Env:
//   NPM_REGISTRY overrides the registry base URL; the shebang's allowed net host
//   covers the default (registry.npmjs.org) — widen the flag for other hosts.

import { parseArgs } from '@std/cli/parse-args'

const {
  'dry-run': dryRun = false,
  only: onlyArg,
} = parseArgs(Deno.args, {
  boolean: ['dry-run'],
  string: ['only'],
  alias: { o: 'only' },
})
const only = new Set((onlyArg ?? '').split(',').map((s) => s.trim()).filter(Boolean))

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

const rows = workspaceRows().filter((p) => only.size === 0 || only.has(p.name))
const slug = remoteSlug()

const statuses = await Promise.all(rows.map((p) => registryStatus(p.name)))
const unpublished: Array<{ name: string; path: string }> = []
for (let i = 0; i < rows.length; i++) {
  const p = rows[i]
  const status = statuses[i]
  console.log(`${p.name} … ${status === 404 ? 'unpublished (404)' : `published (HTTP ${status}) — skipped`}`)
  if (status === 404) unpublished.push(p)
}

if (unpublished.length === 0) {
  console.log('nothing to publish')
  Deno.exit(0)
}

console.log('')
console.log(`publishing ${unpublished.length} package(s):`)
for (const p of unpublished) {
  const name = p.name
  const seq: Array<Array<string>> = [
    ['corepack', 'pnpm', '--filter', name, 'build'],
    ['corepack', 'pnpm', '--filter', name, 'publish', '--access', 'public', '--no-git-checks'],
    ['npm', 'trust', 'github', name, '--repo', slug, '--file', 'release.yml', '--allow-publish', '--yes'],
    ['npm', 'trust', 'list', name],
  ]

  console.log(`\n== ${name}`)
  let ok = true
  for (const args of seq) {
    console.log(`  > ${args.join(' ')}`)
    if (dryRun) continue
    if (!(await runInteractive(args, p.path))) {
      console.error(`  FAILED: ${args.join(' ')}`)
      ok = false
      break
    }
  }
  if (!ok) {
    console.error(`aborting: ${name} failed; remaining packages untouched`)
    Deno.exit(1)
  }
}
console.log('\ndone')
