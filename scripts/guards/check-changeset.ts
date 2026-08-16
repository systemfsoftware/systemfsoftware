#!/usr/bin/env -S deno run --allow-run=git,turbo --allow-read --allow-write=/tmp
// The gate writes exactly one throwaway worktree under the OS temp dir and
// removes it unconditionally; `--allow-write=/tmp` is the entire write budget.
// The turbo it spawns is the lockfile's shim at node_modules/.bin/turbo;
// running the gate therefore requires that directory on PATH (`.github/actions/
// install-deps` + the workflow prepend it), and the shim's existence is
// asserted before any spawn.
// LOCKED SURFACE — evaluation script (AGENTS.md Surface Classes).
// Never edit this file to make a PR pass; change the PR.
//
// The changeset requirement keys on the per-package turbo `build` task hash,
// compared between the PR's pinned base commit and its head (REPO-R2). A
// publishable package whose hash differs demands an intent file; one whose
// hash is identical demands nothing, no matter which files were touched.
// The hash is turbo's own verdict over every input of the shipped `dist/`:
// input files, manifest, task definition, auto-included config files, and the
// hashes of dependency build tasks.
//
// Determinism contract (probes 2026-08-16, turbo 2.10.5):
//   - identical trees -> identical per-task hashes
//   - any manifest edit, build-script edit, src edit, or dependency-task
//     change re-hashes (manifest and command are part of the verdict)
//   - lockfile / pnpm-workspace.yaml / root package.json edits hash nothing
//   - `scripts/tools/patch-tsgo-if-needed.mjs` (a globalDependency) and
//     `turbo.json` edits re-hash every task
//   - per-task hashes are env-invariant; `globalPassThroughEnv` values live
//     only in `globalCacheInputs` and never in a task hash
//   - a package without a `build` script still carries a `#build` task
//     (command <NONEXISTENT>), so removing a build script re-hashes instead
//     of vanishing; task absence at head means the package left the workspace
//   - the dry-run `inputs` display is not the whole hash; the verdict follows
//     the hash, never a file list
//
// The binary that computes the verdict is the lockfile-installed one —
// `node_modules/.bin/turbo` after `pnpm install --frozen-lockfile`. No npx,
// no registry fetch, no ephemeral runner: the installed binary is verified
// against `pnpm-lock.yaml` before any run, and the selftest recomputes the
// same pair.

type WorkspaceMember = {
  readonly name: string
  readonly dir: string
  readonly releasable: boolean
}

type HashMatrix = Readonly<Record<string, string>> // package name -> build-task hash

type Evidence = {
  readonly base: HashMatrix
  readonly head: HashMatrix
  readonly members: readonly WorkspaceMember[]
  readonly changedFiles: readonly string[]
  readonly changesets: readonly string[]
}

type Verdict = {
  readonly touched: readonly string[]
  readonly missingIntent: readonly string[]
}

type DryRun = {
  readonly packages: readonly string[]
  readonly matrix: HashMatrix
  readonly dirs: Readonly<Record<string, string>> // package name -> package directory
}

const BUMPS = ['none', 'patch', 'minor', 'major'] as const
const MANIFEST_SUFFIX = '/package.json'
const LOCKFILE = 'pnpm-lock.yaml'

const dec = new TextDecoder()

const git = async (args: string[]): Promise<string[]> => {
  const out = await new Deno.Command('git', { args, stdout: 'piped', stderr: 'piped' }).output()
  if (!out.success) throw new Error(`git ${args[0]} failed: ${dec.decode(out.stderr).trim()}`)
  return dec.decode(out.stdout).split('\n').filter(Boolean)
}

export const declaresBumpFor = (changeset: string, packageName: string): boolean =>
  new RegExp(
    `^\\s*["']?${packageName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']?\\s*:\\s*(?:${BUMPS.join('|')})\\s*$`,
    'im',
  ).test(changeset)

export const memberOwning = (file: string, members: readonly WorkspaceMember[]): WorkspaceMember | null =>
  members.find(({ dir }) => file === `${dir}${MANIFEST_SUFFIX}` || file.startsWith(`${dir}/`)) ?? null

/**
 * The effect of a difference between two per-package hash maps:
 * - head-absent: the package left the workspace; no release record is possible
 *   or needed (removal is a source-control decision visible in the PR diff)
 * - base-absent: the package is new; it counts as changed
 * - both present and different: changed — demands an intent
 * - both present and equal: unchanged — demands nothing
 *
 * The fallback (R6) covers a releasable member with no `#build` task in either
 * run — impossible today (turbo tasks every workspace package) but fail-safe:
 * any changed file under its directory demands an intent. This per-file rule
 * is deliberately coarser than the old gate's globs; it is a floor, not a
 * philosophy.
 */
export const verdict = (
  { base, head, members, changedFiles, changesets }: Evidence,
): Verdict => {
  const touched = new Set<string>()

  for (const member of members) {
    if (!member.releasable) continue
    const atBase = member.name in base ? base[member.name] : undefined
    const atHead = member.name in head ? head[member.name] : undefined

    if (atHead === undefined) continue // package or task gone at head
    if (atBase === undefined || atBase !== atHead) touched.add(member.name)
  }

  for (const member of members) {
    if (!member.releasable) continue
    if (member.name in base || member.name in head) continue
    if (changedFiles.some((file) => memberOwning(file, [member]))) touched.add(member.name)
  }

  const sorted = [...touched].sort()
  return {
    touched: sorted,
    missingIntent: sorted.filter((name) => !changesets.some((changeset) => declaresBumpFor(changeset, name))),
  }
}

/**
 * `turbo run build --dry=json` stdout is one JSON document; stderr may carry
 * progress noise and is discarded. Every build task must carry a hash — a task
 * without one is a verdict nobody can judge, so it fails closed.
 */
export const parseDryRunOutput = (stdout: string, context: string): DryRun => {
  let doc: { packages?: unknown; tasks?: unknown }
  try {
    doc = JSON.parse(stdout) as typeof doc
  } catch {
    throw new Error(`unparsable ${context} output — expected JSON from 'turbo run build --dry=json'`)
  }
  if (!Array.isArray(doc.packages) || !Array.isArray(doc.tasks)) {
    throw new Error(`${context} output missing the packages/tasks arrays — is this turbo's dry-run JSON?`)
  }

  const matrix: Record<string, string> = {}
  const dirs: Record<string, string> = {}
  for (const task of doc.tasks) {
    const { taskId, hash, directory, package: name } = task as {
      taskId?: unknown
      hash?: unknown
      directory?: unknown
      package?: unknown
    }
    if (typeof taskId !== 'string' || !taskId.endsWith('#build')) continue
    if (typeof name !== 'string' || name.length === 0) {
      throw new Error(`${context} output: a build task without a package name`)
    }
    if (typeof hash !== 'string' || hash.length === 0) {
      throw new Error(`${context} output: ${name}#build has no hash`)
    }
    if (name in matrix) throw new Error(`${context} output: duplicate task for ${name}`)
    matrix[name] = hash
    if (typeof directory === 'string' && directory.length > 0) dirs[name] = directory
  }
  return { packages: doc.packages as string[], matrix, dirs }
}

const TURBO_BIN_DIR = `${Deno.cwd()}/node_modules/.bin`
const TURBO = 'turbo'

const dryRun = async (cwd: string): Promise<DryRun> => {
  const shim = `${TURBO_BIN_DIR}/${TURBO}`
  try {
    await Deno.lstat(shim)
  } catch {
    throw new Error(
      `turbo not present at ${shim} — run 'pnpm install --frozen-lockfile' (the gate runs the lockfile-installed binary, nothing else)`,
    )
  }
  const out = await new Deno.Command(TURBO, {
    args: ['run', 'build', '--dry=json'],
    cwd,
    stdout: 'piped',
    stderr: 'piped',
  }).output()
  if (!out.success) {
    const tail = dec.decode(out.stderr).trim().split('\n').slice(-5).join('\n')
    throw new Error(`turbo dry run failed in ${cwd}:\n${tail}`)
  }
  return parseDryRunOutput(dec.decode(out.stdout), cwd)
}

/**
 * The lockfile is the engine-of-record: the resolved turbo version it names is
 * the version `pnpm install --frozen-lockfile` puts in node_modules, and the
 * selftest recomputes this exact value from these exact bytes. A pnpm major
 * bump that changes the schema breaks the assertion here before it can
 * silently redirect the verdict.
 */
export const lockfileIsV9 = (lockfile: string): boolean => /^lockfileVersion:\s*['"]?9\.0['"]?\s*$/m.test(lockfile)

export const lockfileTurboEntry = (lockfile: string): { specifier: string; version: string } | null => {
  const importers = lockfile.slice(lockfile.indexOf('\nimporters:'))
  if (importers.length === 0) return null
  const rootStart = importers.indexOf('\n  .:')
  if (rootStart === -1) return null
  const root = importers.slice(rootStart + 1)
  const nextRoot = root.search(/^\n[ ]{2}(?!\.)/m)
  const block = (nextRoot === -1 ? root : root.slice(0, nextRoot)) + '\n'
  const match = /^ {6}turbo:\n {8}specifier: (\S+)\n {8}version: ([^\s'\n]+)/m.exec(block)
  return match ? { specifier: match[1], version: match[2] } : null
}

/**
 * Verdict-time and selftest-time authority check: recompute from source bytes
 * whether the installed binary is the lockfile's binary. Throws with the fix
 * instruction so a stale install cannot masquerade as a verdict.
 */
export const assertTurboPin = (lockfile: string, resolvedTurboPackageJson: string, context: string): void => {
  if (!lockfileIsV9(lockfile)) {
    throw new Error(`${context}: ${LOCKFILE} is not lockfileVersion 9.0 — the pin parser is schema-bound`)
  }
  const pinned = lockfileTurboEntry(lockfile)
  if (pinned === null) {
    throw new Error(`${context}: no 'turbo' devDependency in the root importer of ${LOCKFILE}`)
  }
  let resolved: { version?: unknown }
  try {
    resolved = JSON.parse(resolvedTurboPackageJson) as typeof resolved
  } catch {
    throw new Error(`${context}: node_modules/turbo/package.json is not parseable JSON`)
  }
  if (resolved.version !== pinned.version) {
    throw new Error(
      `${context}: installed turbo ${String(resolved.version)} does not match the lockfile pin ${pinned.version} — ` +
        `run 'pnpm install --frozen-lockfile'`,
    )
  }
}

const reportMissingIntent = (missingIntent: readonly string[]) => {
  console.error(
    `::error::This PR changes the turbo build hash of ${missingIntent.length} publishable package(s) that no changeset in it names: ${
      missingIntent.join(', ')
    }`,
  )
  console.error('')
  console.error('Add a `.changeset/<slug>.md` naming each one — the frontmatter is the intent:')
  console.error('')
  console.error('  ---')
  for (const name of missingIntent) console.error(`  "${name}": patch`)
  console.error('  ---')
  console.error('')
  console.error('  <one line saying what changed for a consumer>')
  console.error('')
  console.error(
    `Bumps are ${
      BUMPS.join(' | ')
    }. \`none\` intentionally records a touch that releases nothing; a devDependency-only or ` +
      'script-only bump is the canonical `none` class (REPO-R2).',
  )
}

const readMember = async (manifestPath: string): Promise<WorkspaceMember | null> => {
  let manifest: { name?: unknown; private?: unknown }
  try {
    manifest = JSON.parse(await Deno.readTextFile(manifestPath)) as typeof manifest
  } catch {
    return null
  }
  return typeof manifest.name === 'string' && manifest.name.length > 0
    ? {
      name: manifest.name,
      dir: manifestPath.slice(0, -MANIFEST_SUFFIX.length),
      releasable: manifest.private !== true,
    }
    : null
}

/**
 * Membership is turbo's: the union of the two dry-runs' tasks' directories,
 * with the head manifest's `private` bit deciding releasability. The only
 * extra source is a name→dir map for taskless manifests (the R6 fallback needs
 * a directory to judge file ownership); it is consulted only when a member
 * actually has no `#build` task, and it never invents memberships — a manifest
 * turbo skipped stays outside the verdict.
 */
const membersFromDirs = async (
  runs: readonly DryRun[],
  dirs: Map<string, string>,
): Promise<readonly WorkspaceMember[]> => {
  const turboMembers = new Set(runs.flatMap((run) => run.packages))
  for (const manifestPath of await git(['ls-files', '*package.json', ':(exclude)repos/**'])) {
    const dir = manifestPath.slice(0, -MANIFEST_SUFFIX.length)
    if (dirs.has(dir)) continue
    const text = await Deno.readTextFile(manifestPath).catch(() => '')
    if (text.length === 0) continue
    try {
      const { name } = JSON.parse(text) as { name?: unknown }
      // The name→dir map exists only for turbo members (packages[]); a tracked
      // manifest turbo does not enumerate — a testResources fixture — is not a
      // member, so it can never demand an intent (R11).
      if (typeof name === 'string' && turboMembers.has(name) && !dirs.get(name)) {
        dirs.set(name, dir)
      }
    } catch {
      // a malformed manifest is not a member; turbo skipped it and so do we
    }
  }
  return (await Promise.all(
    [...dirs.entries()].map(([, dir]) => readMember(`${dir}${MANIFEST_SUFFIX}`)),
  )).filter((member): member is WorkspaceMember => member !== null && dirs.get(member.name) === member.dir)
}

const main = async (baseArg: string | undefined): Promise<number> => {
  if (!baseArg) {
    console.error('usage: check-changeset.ts <base-sha-or-ref>')
    return 2
  }

  const lockfile = await Deno.readTextFile(LOCKFILE)
  const resolvedTurbo = await Deno.readTextFile('node_modules/turbo/package.json').catch(() => '{}')
  assertTurboPin(lockfile, resolvedTurbo, 'check-changeset')

  const [baseSha] = await git(['rev-parse', '--verify', `${baseArg}^{commit}`])

  const baseDir = await Deno.makeTempDir({ prefix: 'changeset-base-' })
  await git(['worktree', 'add', '--detach', '--force', baseDir, baseSha])
  let baseRun: DryRun
  let headRun: DryRun
  try {
    ;[baseRun, headRun] = await Promise.all([
      dryRun(baseDir),
      dryRun(Deno.cwd()),
    ])
  } finally {
    await git(['worktree', 'remove', '--force', baseDir]).catch(() => {})
  }

  const dirs = new Map<string, string>()
  for (const run of [baseRun, headRun]) {
    for (const [name, dir] of Object.entries(run.dirs)) dirs.set(name, dir)
  }
  const members = await membersFromDirs([baseRun, headRun], dirs)

  const changedFiles = await git(['diff', '--name-only', `${baseSha}...HEAD`])
  const changesetPaths =
    (await git(['diff', '--name-only', '--diff-filter=AM', `${baseSha}...HEAD`, '--', '.changeset/*.md']))
      .filter((path) => path !== '.changeset/README.md')
  const changesets = await Promise.all(changesetPaths.map((path) => Deno.readTextFile(path).catch(() => '')))

  const { touched, missingIntent } = verdict({
    base: baseRun.matrix,
    head: headRun.matrix,
    members,
    changedFiles,
    changesets,
  })

  if (touched.length === 0) {
    console.log(
      `changeset gate: no publishable package changed its turbo build hash — skipping (${members.length} member(s))`,
    )
    return 0
  }

  if (missingIntent.length > 0) {
    reportMissingIntent(missingIntent)
    return 1
  }

  console.log(
    `changeset gate: ${touched.length} publishable package(s) changed their turbo build hash, each named by an intent — ${
      touched.join(', ')
    }`,
  )
  return 0
}

const MEMBERS: readonly WorkspaceMember[] = [
  { name: '@scope/published', dir: 'packages/published', releasable: true },
  { name: '@scope/private', dir: 'packages/private', releasable: false },
  { name: '@scope/plugin', dir: 'omp/plugins/plugin', releasable: true },
  { name: '@scope/other', dir: 'packages/other', releasable: true },
  { name: '@scope/taskless', dir: 'packages/taskless', releasable: true },
]

const H = {
  before: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  after: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
}

const FIXTURE_V9 = `lockfileVersion: '9.0'

settings:
  autoInstallPeers: true

importers:

  .:
    devDependencies:
      turbo:
        specifier: ^2.10.5
        version: 2.10.5
`

const DRY_FIXTURE = JSON.stringify({
  turboVersion: '2.10.5',
  packages: ['@scope/published'],
  tasks: [{
    taskId: '@scope/published#build',
    package: '@scope/published',
    hash: H.before,
    directory: 'packages/published',
  }],
})

const DRY_BROKEN = JSON.stringify({
  packages: ['@scope/published'],
  tasks: [{ taskId: '@scope/published#build', package: '@scope/published', directory: 'packages/published' }],
})

const FIXTURES: readonly { label: string; evidence: Evidence; expect: Verdict }[] = [
  {
    label: 'an intent naming the touched package satisfies the gate',
    evidence: {
      base: { '@scope/published': H.before },
      head: { '@scope/published': H.after },
      members: MEMBERS,
      changedFiles: ['packages/published/src/a.ts'],
      changesets: ['---\n"@scope/published": patch\n---\n'],
    },
    expect: { touched: ['@scope/published'], missingIntent: [] },
  },
  {
    label: 'no changeset at all leaves the touched package unnamed',
    evidence: {
      base: { '@scope/published': H.before },
      head: { '@scope/published': H.after },
      members: MEMBERS,
      changesets: [],
      changedFiles: ['packages/published/src/a.ts'],
    },
    expect: { touched: ['@scope/published'], missingIntent: ['@scope/published'] },
  },
  {
    label: 'an intent for another package is not cover',
    evidence: {
      base: { '@scope/published': H.before },
      head: { '@scope/published': H.after },
      members: MEMBERS,
      changesets: ['---\n"@scope/other": patch\n---\n'],
      changedFiles: ['packages/published/src/a.ts'],
    },
    expect: { touched: ['@scope/published'], missingIntent: ['@scope/published'] },
  },
  {
    label: 'a package whose hash does not change demands nothing',
    evidence: {
      base: { '@scope/published': H.before },
      head: { '@scope/published': H.before },
      members: MEMBERS,
      changesets: [],
      changedFiles: ['packages/published/README.md'],
    },
    expect: { touched: [], missingIntent: [] },
  },
  {
    label: 'a package that cannot release is never demanded',
    evidence: {
      base: { '@scope/private': H.before },
      head: { '@scope/private': H.after },
      members: MEMBERS,
      changesets: [],
      changedFiles: ['packages/private/src/a.ts'],
    },
    expect: { touched: [], missingIntent: [] },
  },
  {
    label: 'a publishable package outside packages/ is demanded',
    evidence: {
      base: { '@scope/plugin': H.before },
      head: { '@scope/plugin': H.after },
      members: MEMBERS,
      changesets: [],
      changedFiles: ['omp/plugins/plugin/src/a.ts'],
    },
    expect: { touched: ['@scope/plugin'], missingIntent: ['@scope/plugin'] },
  },
  {
    label: 'a file outside every member belongs to no package',
    evidence: {
      base: { '@scope/published': H.after },
      head: { '@scope/published': H.after },
      members: MEMBERS,
      changesets: [],
      changedFiles: ['README.md', 'scripts/guards/check-changeset.ts'],
    },
    expect: { touched: [], missingIntent: [] },
  },
  {
    label: 'none is an intent, not an absence',
    evidence: {
      base: { '@scope/published': H.before },
      head: { '@scope/published': H.after },
      members: MEMBERS,
      changesets: ['---\n"@scope/published": none\n---\n'],
      changedFiles: ['packages/published/src/a.ts'],
    },
    expect: { touched: ['@scope/published'], missingIntent: [] },
  },
  {
    label: 'a name that prefixes another is not mistaken for it',
    evidence: {
      base: { '@scope/published': H.before },
      head: { '@scope/published': H.after },
      members: MEMBERS,
      changesets: ['---\n"@scope/published-extra": patch\n---\n'],
      changedFiles: ['packages/published/src/a.ts'],
    },
    expect: { touched: ['@scope/published'], missingIntent: ['@scope/published'] },
  },
  {
    label: 'a devDependencies-only edit changes the hash and demands its record',
    evidence: {
      base: { '@scope/published': H.before },
      head: { '@scope/published': H.after },
      members: MEMBERS,
      changesets: [],
      changedFiles: ['packages/published/package.json'],
    },
    expect: { touched: ['@scope/published'], missingIntent: ['@scope/published'] },
  },
  {
    label: 'removing the build script keeps the task and re-hashes',
    evidence: {
      base: { '@scope/published': H.before },
      head: { '@scope/published': H.after },
      members: MEMBERS,
      changesets: [],
      changedFiles: ['packages/published/package.json'],
    },
    expect: { touched: ['@scope/published'], missingIntent: ['@scope/published'] },
  },
  {
    label: 'a new package demands an intent',
    evidence: {
      base: {},
      head: { '@scope/published': H.before },
      members: MEMBERS,
      changesets: [],
      changedFiles: ['packages/published/src/a.ts'],
    },
    expect: { touched: ['@scope/published'], missingIntent: ['@scope/published'] },
  },
  {
    label: 'a package gone at head demands nothing',
    evidence: {
      base: { '@scope/published': H.before },
      head: {},
      members: MEMBERS,
      changesets: [],
      changedFiles: ['packages/published/src/a.ts'],
    },
    expect: { touched: [], missingIntent: [] },
  },
  {
    label: 'a propagated hash change (a dependency change) demands its intent',
    evidence: {
      base: { '@scope/published': H.before, '@scope/other': H.before },
      head: { '@scope/published': H.after, '@scope/other': H.after },
      members: MEMBERS,
      changesets: ['---\n"@scope/other": minor\n---\n'],
      changedFiles: ['packages/other/src/b.ts'],
    },
    expect: { touched: ['@scope/other', '@scope/published'], missingIntent: ['@scope/published'] },
  },
  {
    label: 'two touched packages need two names',
    evidence: {
      base: { '@scope/published': H.before, '@scope/plugin': H.before },
      head: { '@scope/published': H.after, '@scope/plugin': H.after },
      members: MEMBERS,
      changesets: ['---\n"@scope/published": minor\n---\n'],
      changedFiles: ['packages/published/src/a.ts', 'omp/plugins/plugin/src/b.ts'],
    },
    expect: { touched: ['@scope/plugin', '@scope/published'], missingIntent: ['@scope/plugin'] },
  },
  {
    label: 'a taskless releasable member falls back to its directory',
    evidence: {
      base: {},
      head: {},
      members: MEMBERS,
      changesets: [],
      changedFiles: ['packages/taskless/src/a.ts'],
    },
    expect: { touched: ['@scope/taskless'], missingIntent: ['@scope/taskless'] },
  },
  {
    label: 'a taskless releasable member with no changed file under it is not demanded',
    evidence: {
      base: { '@scope/published': H.before },
      head: { '@scope/published': H.before },
      members: MEMBERS,
      changesets: [],
      changedFiles: ['packages/published/src/a.ts'],
    },
    expect: { touched: [], missingIntent: [] },
  },
]

const selftest = async (): Promise<number> => {
  const failures: string[] = []

  for (const { label, evidence, expect } of FIXTURES) {
    const got = verdict(evidence)
    if (JSON.stringify(got) !== JSON.stringify(expect)) {
      failures.push(`  ${label}:\n    expected ${JSON.stringify(expect)}\n    got      ${JSON.stringify(got)}`)
    }
  }

  const checks: readonly [string, boolean][] = [
    ['lockfileVersion 9.0 recognized', lockfileIsV9(FIXTURE_V9)],
    ['lockfileVersion 8.0 rejected', !lockfileIsV9("lockfileVersion: '8.0'\n")],
    [
      'turbo entry parsed from the live importer structure',
      JSON.stringify(lockfileTurboEntry(FIXTURE_V9)) === JSON.stringify({ specifier: '^2.10.5', version: '2.10.5' }),
    ],
    [
      'no turbo entry in a non-root importer',
      lockfileTurboEntry(`
importers:

  packages/foo:
    devDependencies:
      turbo:
        specifier: ^1
        version: 1.2.3
`) === null,
    ],
    [
      'archived dry-run JSON parses into a matrix',
      JSON.stringify(parseDryRunOutput(DRY_FIXTURE, 'fixture').matrix) ===
        JSON.stringify({ '@scope/published': H.before }),
    ],
    [
      'a task without a hash fails closed',
      (() => {
        try {
          parseDryRunOutput(DRY_BROKEN, 'fixture')
          return false
        } catch {
          return true
        }
      })(),
    ],
    [
      'non-JSON dry-run output fails closed',
      (() => {
        try {
          parseDryRunOutput('turbo: not json', 'fixture')
          return false
        } catch {
          return true
        }
      })(),
    ],
  ] as const
  for (const [label, ok] of checks) {
    if (!ok) failures.push(`  ${label}`)
  }

  try {
    assertTurboPin(FIXTURE_V9, JSON.stringify({ version: '2.10.5' }), 'selftest-fixture')
  } catch {
    failures.push('  pin check accepts a matching lockfile+install')
  }
  try {
    assertTurboPin(FIXTURE_V9, JSON.stringify({ version: '9.9.9' }), 'selftest-fixture')
    failures.push('  pin check rejects a mismatched install')
  } catch {
    // expected red
  }

  // The live pair, recomputed from source bytes: the lockfile's pin and the
  // installed engine manifest must agree wherever the selftest runs (CI runs
  // it right after the frozen install). This is the same assertion main()
  // enforces before any verdict.
  try {
    assertTurboPin(
      await Deno.readTextFile(LOCKFILE),
      await Deno.readTextFile('node_modules/turbo/package.json'),
      'selftest',
    )
  } catch (error) {
    failures.push(`  live pin check: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (failures.length > 0) {
    console.error(`check-changeset: selftest FAILED (${failures.length}/${FIXTURES.length + 9})\n`)
    for (const failure of failures) console.error(failure)
    return 1
  }
  console.log(`check-changeset: selftest ok (${FIXTURES.length} verdict rows + 9 mechanism rows)`)
  return 0
}

try {
  Deno.exitCode = Deno.args.includes('--selftest') ? await selftest() : await main(Deno.args[0])
} catch (error) {
  console.error(`::error::${error instanceof Error ? error.message : String(error)}`)
  Deno.exitCode = 1
}
