#!/usr/bin/env -S deno run --allow-read --allow-write --allow-run=pnpm,npm,tar --allow-net=registry.npmjs.org --allow-env=GITHUB_STEP_SUMMARY,GITHUB_OUTPUT
// snapshot.ts — publish a pull request's packages as npm snapshot versions.
//
// The shell around `./snapshot-plan.ts`: it reads git-tracked intents, the
// registry and the workspace, calls the pure decisions, and writes. One
// subcommand per workflow step:
//
//   plan    --sha <40-hex> --pr <n> [--head-sha <40-hex>] --out <plan.json>
//   stamp   --plan <plan.json>                 rewrite member manifests in this checkout
//   pack    --plan <plan.json> --out <dir>     pnpm pack each member, one at a time
//   verify  --plan <plan.json> --dir <dir>     tarball bytes against the plan
//   publish --plan <plan.json> --dir <dir>     preflight, then npm publish in order
//   untag   --pr <n>                           remove pr-<n> wherever it is set
//   --selftest                                 the decisions' laws and refusals
//
// Mutations happen only in a CI checkout; nothing here commits.

import { pooledMap } from '@std/async/pool'
import { parseArgs } from '@std/cli/parse-args'
import { join } from '@std/path'
import { loadWorkspaceCycle } from './cycle.ts'
import { REGISTRY_CONCURRENCY } from './npm-query.ts'
import { pendingIntents } from './pending-intents.ts'
import { publishOutcome } from './publish-set.ts'
import { run } from './run.ts'
import {
  distTag,
  type Manifest,
  pinBlock,
  planSet,
  preflight,
  type Registration,
  type SnapshotPlan,
  snapshotVersion,
  stampManifest,
  verifyTarballs,
} from './snapshot-plan.ts'
import { selftest } from './snapshot-selftest.ts'
import { rawWorkspacePackages } from './workspace.ts'

const REGISTRY = 'https://registry.npmjs.org'

const fail = (message: string): never => {
  console.error(`::error::${message}`)
  Deno.exit(1)
}

const readManifest = async (dir: string): Promise<Manifest> =>
  JSON.parse(await Deno.readTextFile(join(dir, 'package.json'))) as Manifest

const readPlan = async (path: string): Promise<SnapshotPlan> =>
  JSON.parse(await Deno.readTextFile(path)) as SnapshotPlan

const appendTo = async (envKey: string, text: string): Promise<void> => {
  const path = Deno.env.get(envKey)
  if (path) await Deno.writeTextFile(path, text, { append: true })
}

const required = (value: string | undefined, flag: string): string => value ?? fail(`missing --${flag}`)

const seedNames = async (): Promise<Set<string>> => {
  const intents = await pendingIntents('.changeset')
  const unreadable = intents.filter((i) => i.bumps === null).map((i) => i.stem)
  if (unreadable.length > 0) {
    fail(`intent frontmatter unreadable, cannot tell which packages it names: ${unreadable.join(', ')}`)
  }
  const bumped = intents.flatMap((i) => Object.entries(i.bumps!).filter(([, bump]) => bump !== 'none').map(([n]) => n))
  const owed = (await loadWorkspaceCycle()).map((e) => e.name)
  return new Set([...bumped, ...owed])
}

type Flags = {
  readonly sha?: string
  readonly pr?: string
  readonly 'head-sha'?: string
  readonly out?: string
  readonly plan?: string
  readonly dir?: string
}

const plan = async (flags: Flags): Promise<void> => {
  const sha = required(flags.sha, 'sha')
  const pr = Number(required(flags.pr, 'pr'))
  const version = snapshotVersion(sha)
  const tag = distTag(pr)
  const members = await rawWorkspacePackages()
  const manifests = await Promise.all(members.map((m) => readManifest(m.path)))
  const dirOf = new Map(members.map((m) => [m.name, m.path]))
  const decision = planSet(manifests, await seedNames())
  if (decision.kind === 'refused') return fail(decision.reason)
  const result: SnapshotPlan = {
    sha,
    headSha: flags['head-sha'] ?? sha,
    pr,
    distTag: tag,
    members: decision.members.map((name) => ({ name, version, dir: dirOf.get(name)! })),
    exclusions: decision.exclusions,
  }
  await Deno.writeTextFile(required(flags.out, 'out'), `${JSON.stringify(result, null, 2)}\n`)
  for (const e of result.exclusions) console.log(`excluded ${e.name}: ${e.reason}`)
  console.log(
    result.members.length === 0
      ? 'snapshot set is empty: no pending releasing intent and no owed version'
      : `snapshot set (${result.members.length}) at ${version} under ${tag}:\n${
        result.members.map((m) => `  ${m.name}`).join('\n')
      }`,
  )
  await appendTo(
    'GITHUB_OUTPUT',
    `count=${result.members.length}\nfilters=${result.members.map((m) => `--filter=${m.name}`).join(' ')}\n`,
  )
}

const stamp = async (flags: Flags): Promise<void> => {
  const p = await readPlan(required(flags.plan, 'plan'))
  const versions = new Map(p.members.map((m) => [m.name, m.version]))
  for (const member of await rawWorkspacePackages()) {
    const raw = JSON.parse(await Deno.readTextFile(join(member.path, 'package.json'))) as Manifest
    const stamped = stampManifest(raw, versions)
    if (JSON.stringify(stamped) !== JSON.stringify(raw)) {
      await Deno.writeTextFile(join(member.path, 'package.json'), `${JSON.stringify(stamped, null, 2)}\n`)
      console.log(`stamped ${member.name}`)
    }
  }
}

const pack = async (flags: Flags): Promise<void> => {
  const p = await readPlan(required(flags.plan, 'plan'))
  const out = await Deno.realPath(required(flags.out, 'out'))
  // One at a time: pack-time lifecycle hooks rebuild dist, and a concurrent
  // pack reads a dist another one is deleting.
  for (const m of p.members) await run('pnpm', ['--dir', m.dir, 'pack', '--pack-destination', out])
  console.log(`packed ${p.members.length} tarball(s) into ${out}`)
}

const tarballs = async (dir: string): Promise<{ file: string; manifest: Manifest }[]> => {
  const files: string[] = []
  for await (const entry of Deno.readDir(dir)) if (entry.isFile && entry.name.endsWith('.tgz')) files.push(entry.name)
  return Promise.all(
    files.sort().map(async (file) => ({
      file: join(dir, file),
      manifest: JSON.parse(await run('tar', ['-xzOf', join(dir, file), 'package/package.json'])) as Manifest,
    })),
  )
}

const verify = async (flags: Flags): Promise<void> => {
  const p = await readPlan(required(flags.plan, 'plan'))
  const problems = verifyTarballs(p, (await tarballs(required(flags.dir, 'dir'))).map((t) => t.manifest))
  if (problems.length > 0) fail(`tarballs disagree with the plan:\n${problems.join('\n')}`)
  console.log(`verified ${p.members.length} tarball(s) against the plan`)
}

/** 404 on the packument means npm has never served the name; any other failure is unreadable, never a guess. */
const registration = async (name: string): Promise<Registration> => {
  try {
    const res = await fetch(`${REGISTRY}/${encodeURIComponent(name).replace('%40', '@')}`, {
      headers: { accept: 'application/vnd.npm.install-v1+json' },
    })
    await res.body?.cancel()
    return res.status === 404 ? 'never-published' : res.ok ? 'served' : 'unreadable'
  } catch {
    return 'unreadable'
  }
}

const publish = async (flags: Flags): Promise<void> => {
  const p = await readPlan(required(flags.plan, 'plan'))
  if (p.members.length === 0) return console.log('snapshot set is empty: nothing to publish')
  const statuses = await Array.fromAsync(
    pooledMap(REGISTRY_CONCURRENCY, p.members, async (m) => ({ name: m.name, status: await registration(m.name) })),
  )
  const gate = preflight(statuses)
  if (gate.kind === 'blocked') return fail(gate.reason.replaceAll('<pr-tag>', p.distTag))
  const fileOf = new Map((await tarballs(required(flags.dir, 'dir'))).map((t) => [t.manifest.name, t.file]))
  const failed: string[] = []
  for (const m of p.members) {
    const out = await new Deno.Command('npm', {
      args: [
        'publish',
        fileOf.get(m.name)!,
        '--tag',
        p.distTag,
        '--access',
        'public',
        '--provenance',
        '--ignore-scripts',
      ],
      stdout: 'piped',
      stderr: 'piped',
    }).output()
    const text = new TextDecoder().decode(out.stdout) + new TextDecoder().decode(out.stderr)
    const outcome = publishOutcome(out.success, text)
    console.log(`${m.name}@${m.version}: ${outcome}`)
    if (outcome === 'failed') {
      console.error(text.trimEnd())
      failed.push(m.name)
    }
  }
  const exclusions = p.exclusions.map((e) => `- excluded \`${e.name}\`: ${e.reason}`).join('\n')
  await appendTo(
    'GITHUB_STEP_SUMMARY',
    `## Snapshot \`${p.distTag}\`\n\nBuilt at \`${p.sha}\` (PR head \`${p.headSha}\`).\n\n${
      exclusions ? `${exclusions}\n\n` : ''
    }\`\`\`text\n${pinBlock(p.members)}\n\`\`\`\n`,
  )
  if (failed.length > 0) fail(`npm publish failed for ${failed.join(', ')}`)
}

const untag = async (flags: Flags): Promise<void> => {
  const tag = distTag(Number(required(flags.pr, 'pr')))
  const names = (await rawWorkspacePackages()).map((m) => m.name)
  const tagged = (await Array.fromAsync(pooledMap(REGISTRY_CONCURRENCY, names, async (name) => {
    const res = await fetch(`${REGISTRY}/-/package/${encodeURIComponent(name).replace('%40', '@')}/dist-tags`)
    if (res.status === 404) return { name, has: false }
    if (!res.ok) throw new Error(`registry returned ${res.status} for ${name} dist-tags`)
    return { name, has: Object.hasOwn(await res.json() as Record<string, string>, tag) }
  }))).filter((t) => t.has).map((t) => t.name)
  for (const name of tagged) await run('npm', ['dist-tag', 'rm', name, tag])
  console.log(tagged.length === 0 ? `no package carries ${tag}` : `removed ${tag} from ${tagged.join(', ')}`)
}

const parsed = parseArgs(Deno.args, { string: ['sha', 'pr', 'head-sha', 'out', 'plan', 'dir'], boolean: ['selftest'] })

if (parsed.selftest) Deno.exit(await selftest())

const flags: Flags = parsed

const commands: Record<string, (f: Flags) => Promise<void>> = {
  plan,
  stamp,
  pack,
  verify,
  publish,
  untag,
}
const command = commands[String(parsed._[0])] ??
  fail(`usage: snapshot.ts <${Object.keys(commands).join('|')}> | --selftest`)
await command(flags)
