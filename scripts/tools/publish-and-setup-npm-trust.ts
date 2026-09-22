#!/usr/bin/env -S deno run --allow-run=git,corepack,pnpm,npm --allow-read --allow-write --allow-env=NPM_REGISTRY,GITHUB_REPOSITORY --allow-net=registry.npmjs.org
import { pooledMap } from '@std/async/pool'
import { parseArgs } from '@std/cli/parse-args'
import { join } from '@std/path'
import { queryRegistry, type RegistrySnapshot } from './npm-query.ts'
import { expectedSlug, publicWorkspacePackages, WORKFLOW_FILE, type WorkspacePackage } from './oidc.ts'

type PackageAction =
  | { readonly kind: 'debut'; readonly name: string; readonly dir: string }
  | { readonly kind: 'untrusted'; readonly name: string; readonly dir: string }

type PlanResult = {
  readonly owed: readonly PackageAction[]
  readonly unreadable: readonly string[]
}

type TrustConfig = {
  readonly id?: string
  readonly type?: string
  readonly file?: string
  readonly repository?: string
}

type TrustRead =
  | { readonly kind: 'configs'; readonly configs: readonly TrustConfig[] }
  | { readonly kind: 'unreadable' }

type ReconcileStep =
  | { readonly action: 'already-trusted'; readonly staleIds: readonly string[] }
  | { readonly action: 'replace'; readonly staleIds: readonly string[] }

type PackageRunResult = {
  readonly name: string
  readonly ok: boolean
}

const resolveAction = (
  pkg: WorkspacePackage,
  snapshot: RegistrySnapshot,
  forceTrust: boolean,
): { readonly action?: PackageAction; readonly unreadable?: string } => {
  const dir = pkg.filePath.replace(/\/package\.json$/, '')

  if (snapshot.status === 'error') {
    console.error(`${pkg.name} … registry unreadable`)
    return { unreadable: pkg.name }
  }

  if (snapshot.status === 'unpublished') {
    console.log(`${pkg.name} … unpublished (404) — debut`)
    return { action: { kind: 'debut', name: pkg.name, dir } }
  }

  if (!snapshot.attested) {
    console.log(`${pkg.name} … published ${snapshot.latest}, no provenance attestation — registering trusted publisher`)
    return { action: { kind: 'untrusted', name: pkg.name, dir } }
  }

  if (forceTrust) {
    console.log(`${pkg.name} … published ${snapshot.latest} + attested — re-applying trusted publisher (--all-trust)`)
    return { action: { kind: 'untrusted', name: pkg.name, dir } }
  }

  console.log(`${pkg.name} … published ${snapshot.latest} + attested — skipped (use --all-trust to force trust update)`)
  return {}
}

const planExecution = async (
  packages: readonly WorkspacePackage[],
  registryUrl: string,
  concurrency: number,
  forceTrust: boolean,
): Promise<PlanResult> => {
  const snapshots = await Array.fromAsync(
    pooledMap(concurrency, packages, (pkg: WorkspacePackage) => queryRegistry(pkg.name, registryUrl)),
  )

  const owed: PackageAction[] = []
  const unreadable: string[] = []

  for (let i = 0; i < packages.length; i++) {
    const outcome = resolveAction(packages[i], snapshots[i], forceTrust)
    if (outcome.action) owed.push(outcome.action)
    if (outcome.unreadable) unreadable.push(outcome.unreadable)
  }

  return { owed, unreadable }
}

const runInteractive = async (args: readonly string[], cwd: string): Promise<{ success: boolean; code: number }> => {
  const [command, ...commandArgs] = args
  const child = new Deno.Command(command, {
    args: commandArgs,
    cwd,
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  }).spawn()
  const status = await child.status
  return { success: status.success, code: status.code }
}

const parseTrustJson = (raw: string): readonly TrustConfig[] => {
  const configs: TrustConfig[] = []
  let depth = 0
  let start = -1

  for (let i = 0; i < raw.length; i++) {
    const char = raw[i]
    if (char === '{') {
      if (depth === 0) start = i
      depth++
    } else if (char === '}') {
      depth--
      if (depth === 0 && start !== -1) {
        const slice = raw.slice(start, i + 1)
        try {
          const parsed = JSON.parse(slice)
          if (Array.isArray(parsed)) configs.push(...(parsed as TrustConfig[]))
          else if (parsed && typeof parsed === 'object') configs.push(parsed as TrustConfig)
        } catch {
          // Ignore malformed json chunks
        }
        start = -1
      }
    }
  }

  return configs
}

const readTrustConfigs = async (pkgName: string, cwd: string): Promise<TrustRead> => {
  const out = await new Deno.Command('npm', {
    args: ['trust', 'list', pkgName, '--json'],
    cwd,
    stdin: 'inherit',
    stdout: 'piped',
    stderr: 'inherit',
  }).output()

  if (!out.success) return { kind: 'unreadable' }
  return { kind: 'configs', configs: parseTrustJson(new TextDecoder().decode(out.stdout)) }
}

let trustWindowLock: Promise<void> | null = null

const openTrustWindow = (pkgName: string, cwd: string): Promise<void> => {
  trustWindowLock ??= runInteractive(['npm', 'trust', 'list', pkgName], cwd).then((res) => {
    if (!res.success) trustWindowLock = null
  })
  return trustWindowLock
}

const getTrustConfigs = async (pkgName: string, cwd: string): Promise<TrustRead> => {
  const initial = await readTrustConfigs(pkgName, cwd)
  if (initial.kind === 'configs') return initial

  console.log('  Trust configuration unreadable — reading it needs two-factor authentication')
  await openTrustWindow(pkgName, cwd)
  return readTrustConfigs(pkgName, cwd)
}

const planReconcile = (
  configs: readonly TrustConfig[],
  targetRepo: string,
  targetWorkflow: string,
): ReconcileStep => {
  const isTarget = (cfg: TrustConfig) =>
    cfg.type === 'github' && cfg.repository === targetRepo && cfg.file === targetWorkflow

  const hasTarget = configs.some(isTarget)
  const staleIds = configs
    .filter((c) => hasTarget ? !isTarget(c) : true)
    .map((c) => c.id)
    .filter((id): id is string => typeof id === 'string')

  return hasTarget
    ? { action: 'already-trusted', staleIds }
    : { action: 'replace', staleIds }
}

const reconcileTrust = async (
  pkgName: string,
  cwd: string,
  targetSlug: string,
  dryRun: boolean,
): Promise<boolean> => {
  console.log(`  Querying trust configuration for ${pkgName}...`)
  const read = await getTrustConfigs(pkgName, cwd)

  if (read.kind === 'unreadable') {
    console.error(
      `  Cannot read the trust configuration for ${pkgName}: \`npm trust list\` needs a two-factor challenge this run could not complete. Nothing was changed — run it once in a terminal, then re-run.`,
    )
    return false
  }

  const step = planReconcile(read.configs, targetSlug, WORKFLOW_FILE)

  for (const id of step.staleIds) {
    console.log(`  Cleaning up stale config ${id}`)
    if (!dryRun) {
      const res = await runInteractive(['npm', 'trust', 'revoke', pkgName, `--id=${id}`], cwd)
      if (!res.success && step.action === 'replace') {
        console.error(`  Failed to revoke existing trust id ${id}`)
        return false
      }
    }
  }

  if (step.action === 'already-trusted') {
    console.log(`  Already trusted for ${targetSlug} (${WORKFLOW_FILE}) — no changes needed`)
    return true
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

const hasBuildScript = async (packagePath: string): Promise<boolean> => {
  try {
    const raw = await Deno.readTextFile(join(packagePath, 'package.json'))
    const manifest = JSON.parse(raw) as { scripts?: Record<string, string> }
    return typeof manifest.scripts?.build === 'string'
  } catch {
    return false
  }
}

const executeDebut = async (name: string, dir: string, dryRun: boolean): Promise<boolean> => {
  if (await hasBuildScript(dir)) {
    console.log(`  > corepack pnpm --filter ${name} build`)
    if (!dryRun && !(await runInteractive(['corepack', 'pnpm', '--filter', name, 'build'], dir)).success) {
      return false
    }
  }

  console.log(`  > corepack pnpm --filter ${name} publish --access public --no-git-checks`)
  if (
    !dryRun &&
    !(await runInteractive(
      ['corepack', 'pnpm', '--filter', name, 'publish', '--access', 'public', '--no-git-checks'],
      dir,
    )).success
  ) {
    return false
  }

  return true
}

const processPackage = async (
  action: PackageAction,
  targetSlug: string,
  dryRun: boolean,
): Promise<PackageRunResult> => {
  console.log(`\n== ${action.name} (${action.kind})`)

  if (action.kind === 'debut') {
    const published = await executeDebut(action.name, action.dir, dryRun)
    if (!published) return { name: action.name, ok: false }
  }

  const trusted = await reconcileTrust(action.name, action.dir, targetSlug, dryRun)
  if (!trusted) return { name: action.name, ok: false }

  console.log(`  > npm trust list ${action.name}`)
  if (!dryRun) {
    await runInteractive(['npm', 'trust', 'list', action.name], action.dir)
  }

  return { name: action.name, ok: true }
}

const alignRepositoryUrls = async (
  packages: readonly WorkspacePackage[],
  targetSlug: string,
): Promise<void> => {
  const repositoryUrl = `git+https://github.com/${targetSlug}.git`

  for (const pkg of packages) {
    if (pkg.repositorySlug !== targetSlug) {
      const content = await Deno.readTextFile(pkg.filePath)
      const parsed = JSON.parse(content) as Record<string, unknown>
      if (typeof parsed.repository === 'object' && parsed.repository !== null) {
        ;(parsed.repository as Record<string, unknown>).url = repositoryUrl
      } else {
        parsed.repository = repositoryUrl
      }
      await Deno.writeTextFile(pkg.filePath, JSON.stringify(parsed, null, 2) + '\n')
      console.log(`Updated repository.url for ${pkg.name}`)
    }
  }
}

const main = async (): Promise<void> => {
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
  const onlyList = (onlyArg ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  const only = onlyList.length > 0 ? new Set(onlyList) : null

  const targetSlug = await expectedSlug()
  const registry = Deno.env.get('NPM_REGISTRY') ?? 'https://registry.npmjs.org'

  console.log(`Repository target slug: ${targetSlug}`)
  console.log(`Workflow file: ${WORKFLOW_FILE}`)

  const allPackages = await publicWorkspacePackages()
  if (fixRepo) await alignRepositoryUrls(allPackages, targetSlug)

  const targetPackages = only ? allPackages.filter((p) => only.has(p.name)) : allPackages
  if (targetPackages.length === 0) {
    console.error(
      only
        ? `--only matched no workspace package: ${[...only].join(', ')}`
        : 'no non-private workspace packages discovered',
    )
    Deno.exit(1)
  }

  const { owed, unreadable } = await planExecution(targetPackages, registry, jobs, allTrust)

  if (owed.length === 0) {
    console.log(
      unreadable.length > 0
        ? 'no package has outstanding work, but the registry could not be read for some'
        : 'every package is published and attested — nothing to do',
    )
    Deno.exit(unreadable.length > 0 ? 1 : 0)
  }

  const debuts = owed.filter((p) => p.kind === 'debut').length
  console.log(
    `\nprocessing ${owed.length} package(s) with --jobs ${jobs}: ${debuts} debut, ${owed.length - debuts} untrusted`,
  )

  const results: readonly PackageRunResult[] = await Array.fromAsync(
    pooledMap(jobs, owed, (action: PackageAction) => processPackage(action, targetSlug, dryRun)),
  )

  const failed = results.filter((r) => !r.ok).map((r) => r.name)
  if (failed.length > 0) console.error(`failed: ${failed.join(', ')}`)
  if (unreadable.length > 0) console.error(`registry unreadable: ${unreadable.join(', ')}`)

  if (failed.length > 0 || unreadable.length > 0) Deno.exit(1)
  console.log('\ndone')
}

await main()
