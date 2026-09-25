#!/usr/bin/env -S deno run --allow-run=git,npm --allow-read --allow-write --allow-env=NPM_REGISTRY,GITHUB_REPOSITORY --allow-net=registry.npmjs.org
import { pooledMap } from '@std/async/pool'
import { dirname, join } from '@std/path'
import { queryRegistry, REGISTRY_CONCURRENCY } from '../npm-query.ts'
import { expectedSlug, WORKFLOW_FILE } from '../oidc.ts'
import {
  buildPlatformManifest,
  LAUNCHER_MANIFEST_PATH,
  type LauncherManifest,
  parseCliArgs,
  readJson,
  readTargets,
  type Target,
} from './shared.ts'

const DUMMY_VERSION = '0.0.0-dummy-npm'
const BOOTSTRAP_TAG = 'bootstrap'

type Name =
  | { readonly kind: 'launcher'; readonly name: string }
  | { readonly kind: 'platform'; readonly name: string; readonly target: Target }

type LauncherFiles = LauncherManifest & { readonly files: readonly string[] }

const flags = parseCliArgs({ alias: { 'dry-run': 'dryRun' }, boolean: ['dry-run', 'check'] })
const dryRun = flags.dryRun === true
const registry = Deno.env.get('NPM_REGISTRY') ?? 'https://registry.npmjs.org'

const launcher = await readJson<LauncherFiles>(LAUNCHER_MANIFEST_PATH, 'launcher manifest')
const names: readonly Name[] = [
  { kind: 'launcher', name: launcher.name },
  ...(await readTargets()).map((target) => ({
    kind: 'platform' as const,
    name: `${launcher.name}-${target.suffix}`,
    target,
  })),
]

const snapshots = await Array.fromAsync(
  pooledMap(REGISTRY_CONCURRENCY, names, (entry) => queryRegistry(entry.name, registry)),
)
const missing = names.filter((_, index) => snapshots[index].status === 'unpublished')
const unreadable = names.filter((_, index) => snapshots[index].status === 'error')

for (const [index, entry] of names.entries()) {
  const snapshot = snapshots[index]
  const state = snapshot.status === 'published' ? `published (latest ${snapshot.latest})` : snapshot.status
  console.log(`  ${entry.name.padEnd(48)} ${state}`)
}

if (unreadable.length > 0) {
  console.error(`::error::the registry could not be read for ${unreadable.map((entry) => entry.name).join(', ')}`)
  Deno.exit(1)
}

if (flags.check === true) {
  if (missing.length > 0) {
    console.error(
      `::error::${missing.length} gritlint npm name(s) were never published: ${
        missing.map((entry) => entry.name).join(', ')
      }. OIDC cannot publish a first version; a maintainer runs ./scripts/tools/gritlint/bootstrap-npm.ts once (npm/gritlint/README.md).`,
    )
    Deno.exit(1)
  }
  console.log('every gritlint npm name exists on the registry')
  Deno.exit(0)
}

if (missing.length === 0) {
  console.log('nothing to bootstrap: every gritlint npm name exists on the registry')
  Deno.exit(0)
}

const slug = await expectedSlug()

const copyInto = async (source: string, destination: string): Promise<void> => {
  const info = await Deno.stat(source)
  if (!info.isDirectory) {
    await Deno.copyFile(source, destination)
    return
  }
  await Deno.mkdir(destination, { recursive: true })
  for await (const child of Deno.readDir(source)) {
    await copyInto(join(source, child.name), join(destination, child.name))
  }
}

const stage = async (entry: Name, directory: string): Promise<void> => {
  if (entry.kind === 'platform') {
    const manifest = {
      ...buildPlatformManifest(launcher, entry.target, DUMMY_VERSION),
      publishConfig: { access: 'public' },
    }
    await Deno.writeTextFile(join(directory, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
    await Deno.writeTextFile(join(directory, entry.target.bin), '')
    return
  }
  const launcherDir = dirname(LAUNCHER_MANIFEST_PATH)
  for (const file of launcher.files) {
    await copyInto(join(launcherDir, file), join(directory, file))
  }
  const manifest = { ...launcher, version: DUMMY_VERSION, publishConfig: { access: 'public' } }
  await Deno.writeTextFile(join(directory, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
}

const run = async (command: readonly string[], cwd: string): Promise<boolean> => {
  console.log(`  > ${command.join(' ')}`)
  if (dryRun) return true
  const [program, ...args] = command
  const status = await new Deno.Command(program, { args, cwd, stdin: 'inherit', stdout: 'inherit', stderr: 'inherit' })
    .spawn().status
  return status.success
}

const bootstrap = async (entry: Name): Promise<boolean> => {
  console.log(`\n== ${entry.name} (${entry.kind})`)
  const directory = await Deno.makeTempDir({ prefix: 'gritlint-bootstrap-' })
  try {
    await stage(entry, directory)
    const published = await run(
      ['npm', 'publish', '--access', 'public', '--no-provenance', '--tag', BOOTSTRAP_TAG],
      directory,
    )
    if (!published) return false
    const trust = [
      'npm',
      'trust',
      'github',
      entry.name,
      '--repo',
      slug,
      '--file',
      WORKFLOW_FILE,
      '--allow-publish',
      '--allow-stage-publish',
      '--yes',
    ]
    if (await run(trust, directory)) return true
    console.error(`  the placeholder is published but its trusted publisher is not; run: ${trust.join(' ')}`)
    return false
  } finally {
    await Deno.remove(directory, { recursive: true })
  }
}

const failed: string[] = []
for (const entry of missing) {
  if (!(await bootstrap(entry))) failed.push(entry.name)
}

if (failed.length > 0) {
  console.error(`\nfailed: ${failed.join(', ')}`)
  Deno.exit(1)
}
console.log(`\n${dryRun ? 'dry run: nothing was published' : `bootstrapped ${missing.length} name(s)`}`)
