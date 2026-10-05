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
//   publish --plan <plan.json> --dir <dir> --pr <n> --sha <40-hex>
//                                              admit the plan, verify, preflight, npm publish in order
//   untag   --pr <n>                           remove pr-<n> from every @systemfsoftware package carrying it
//
// The laws live in `./snapshot-selftest.ts`, its own entry point: this file
// runs in the OIDC jobs and imports no npm package.
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
  admitPlan,
  type Checked,
  decodePlan,
  distTag,
  type Manifest,
  type MemberOutcome,
  orgPackageNames,
  planSet,
  preflight,
  publishSummary,
  type Registration,
  type SnapshotPlan,
  snapshotVersion,
  stampManifest,
  taggedPackages,
  verifyTarballs,
} from './snapshot-plan.ts'
import { rawWorkspacePackages } from './workspace.ts'

const REGISTRY = 'https://registry.npmjs.org'
const SCOPE = '@systemfsoftware'

const packagePath = (name: string): string => encodeURIComponent(name).replace('%40', '@')

const fail = (message: string): never => {
  console.error(`::error::${message}`)
  Deno.exit(1)
}

const readManifest = async (dir: string): Promise<Manifest> =>
  JSON.parse(await Deno.readTextFile(join(dir, 'package.json'))) as Manifest

const readPlan = async (path: string): Promise<SnapshotPlan> => {
  const text = await Deno.readTextFile(path)
  const decoded = (() => {
    try {
      return decodePlan(JSON.parse(text))
    } catch {
      return 'plan is not JSON'
    }
  })()
  return typeof decoded === 'string' ? fail(`${path}: ${decoded}`) : decoded
}

const appendTo = async (envKey: string, text: string): Promise<void> => {
  const path = Deno.env.get(envKey)
  if (path) await Deno.writeTextFile(path, text, { append: true })
}

const required = (value: string | undefined, flag: string): string => value ?? fail(`missing --${flag}`)

const unwrap = <T>(c: Checked<T>): T => c.kind === 'ok' ? c.value : fail(c.reason)

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
  const version = unwrap(snapshotVersion(sha))
  const tag = unwrap(distTag(pr))
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
    const res = await fetch(`${REGISTRY}/${packagePath(name)}`, {
      headers: { accept: 'application/vnd.npm.install-v1+json' },
    })
    await res.body?.cancel()
    return res.status === 404 ? 'never-published' : res.ok ? 'served' : 'unreadable'
  } catch {
    return 'unreadable'
  }
}

/**
 * Runs in the OIDC job. The plan comes from a job that ran PR code, so it is
 * admitted against values this job derives itself (`--pr`, `--sha` from the
 * event context; member names from this checkout of the default branch), and
 * the tarballs are verified against the admitted plan right before upload.
 */
const publish = async (flags: Flags): Promise<void> => {
  const p = await readPlan(required(flags.plan, 'plan'))
  const workspace = new Set((await rawWorkspacePackages()).map((m) => m.name))
  const refusals = admitPlan(p, {
    pr: Number(required(flags.pr, 'pr')),
    sha: required(flags.sha, 'sha'),
    workspace,
  })
  if (refusals.length > 0) return fail(`plan refused, nothing was published:\n${refusals.join('\n')}`)
  if (p.members.length === 0) return console.log('snapshot set is empty: nothing to publish')
  const packed = await tarballs(required(flags.dir, 'dir'))
  const problems = verifyTarballs(p, packed.map((t) => t.manifest))
  if (problems.length > 0) {
    return fail(`tarballs disagree with the plan, nothing was published:\n${problems.join('\n')}`)
  }
  const statuses = await Array.fromAsync(
    pooledMap(REGISTRY_CONCURRENCY, p.members, async (m) => ({ name: m.name, status: await registration(m.name) })),
  )
  const gate = preflight(statuses)
  if (gate.kind === 'blocked') return fail(gate.reason.replaceAll('<pr-tag>', p.distTag))
  const fileOf = new Map(packed.map((t) => [t.manifest.name, t.file]))
  const outcomes: MemberOutcome[] = []
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
    const text = (new TextDecoder().decode(out.stdout) + new TextDecoder().decode(out.stderr)).trimEnd()
    const kind = publishOutcome(out.success, text)
    console.log(`${m.name}@${m.version}: ${kind}`)
    if (kind === 'failed') console.error(text)
    outcomes.push(kind === 'failed' ? { ...m, kind, error: text } : { ...m, kind })
  }
  await appendTo('GITHUB_STEP_SUMMARY', publishSummary(p, outcomes))
  const failed = outcomes.filter((o) => o.kind === 'failed').map((o) => o.name)
  if (failed.length > 0) fail(`npm publish failed for ${failed.join(', ')}`)
}

/**
 * Candidates come from the registry, not the workspace: a package debuted
 * under `pr-<n>` in a pull request that never merged exists nowhere on the
 * default branch, and still carries the tag.
 */
const untag = async (flags: Flags): Promise<void> => {
  const tag = unwrap(distTag(Number(required(flags.pr, 'pr'))))
  const listing = await fetch(`${REGISTRY}/-/org/${SCOPE.slice(1)}/package`)
  if (!listing.ok) return fail(`registry returned ${listing.status} for the ${SCOPE} package listing`)
  const names = orgPackageNames(await listing.json(), SCOPE) ??
    fail(`the ${SCOPE} package listing is not a name map`)
  const bodies = new Map(
    await Array.fromAsync(pooledMap(REGISTRY_CONCURRENCY, names, async (name): Promise<[string, unknown]> => {
      const res = await fetch(`${REGISTRY}/-/package/${packagePath(name)}/dist-tags`)
      if (res.status === 404) {
        await res.body?.cancel()
        return [name, null]
      }
      if (!res.ok) throw new Error(`registry returned ${res.status} for ${name} dist-tags`)
      return [name, await res.json()]
    })),
  )
  const tagged = taggedPackages(bodies, tag)
  for (const name of tagged) await run('npm', ['dist-tag', 'rm', name, tag])
  console.log(tagged.length === 0 ? `no package carries ${tag}` : `removed ${tag} from ${tagged.join(', ')}`)
}

const parsed = parseArgs(Deno.args, { string: ['sha', 'pr', 'head-sha', 'out', 'plan', 'dir'] })

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
  fail(`usage: snapshot.ts <${Object.keys(commands).join('|')}>`)
await command(flags)
