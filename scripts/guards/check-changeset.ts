#!/usr/bin/env -S deno run --allow-read --allow-write=/tmp
// Run it as:  deno run --allow-run=git,"$PWD/node_modules/.bin/turbo" --allow-read --allow-write=/tmp \
//             scripts/guards/check-changeset.ts <base-sha>
// The gate writes exactly one throwaway worktree under the OS temp dir and
// removes it after the verdict; a failed cleanup is logged, not fatal
// (`--allow-write=/tmp` is the entire write budget). The turbo it spawns is
// the lockfile's shim at the absolute path `$PWD/node_modules/.bin/turbo` —
// the same object the lstat and the pin check see — so the grant is the
// exact path and nothing earlier on PATH can stand in.
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
//   - a file inside a nested-workspace fixture (testResources) re-hashes every
//     task through the internal-dependencies global input
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
  readonly publishable: boolean
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
  readonly engineVersion: string | null // turbo's own self-report; null when absent
}

const BUMPS = ['none', 'patch', 'minor', 'major'] as const
const MANIFEST_SUFFIX = '/package.json'
const LOCKFILE = 'pnpm-lock.yaml'
const TURBO_MANIFEST = 'node_modules/turbo/package.json'
const TURBO = `${Deno.cwd()}/node_modules/.bin/turbo`
const BUILD_TASK_SUFFIX = '#build'

const dec = new TextDecoder()

const git = async (args: string[]): Promise<string[]> => {
  const out = await new Deno.Command('git', { args, stdout: 'piped', stderr: 'piped' }).output()
  if (!out.success) throw new Error(`git ${args[0]} failed: ${dec.decode(out.stderr).trim()}`)
  return dec.decode(out.stdout).split('\n').filter(Boolean)
}

const declaresBumpFor = (changeset: string, packageName: string): boolean =>
  new RegExp(
    `^\\s*["']?${RegExp.escape(packageName)}["']?\\s*:\\s*(?:${BUMPS.join('|')})\\s*$`,
    'im',
  ).test(changeset)

const memberOwning = (file: string, members: readonly WorkspaceMember[]): WorkspaceMember | null =>
  members.find(({ dir }) => file === `${dir}${MANIFEST_SUFFIX}` || file.startsWith(`${dir}/`)) ?? null

/**
 * The effect of a difference between two per-package hash maps:
 * - head-absent: the package left the workspace; no release record is possible
 *   or needed (removal is a source-control decision visible in the PR diff)
 * - base-absent: the package is new; it counts as changed
 * - both present and different: changed — demands an intent
 * - both present and equal: unchanged — demands nothing
 *
 * The fallback (R6) covers a publishable member with no `#build` task in
 * either run — impossible today (turbo tasks every workspace package) but
 * fail-safe: any changed file under its directory demands an intent. This
 * per-file rule is deliberately coarser than the old gate's globs; it is a
 * floor, not a philosophy.
 */
const verdict = (
  { base, head, members, changedFiles, changesets }: Evidence,
): Verdict => {
  const touched = new Set<string>()

  for (const member of members) {
    if (!member.publishable) continue
    const atBase = Object.hasOwn(base, member.name) ? base[member.name] : undefined
    const atHead = Object.hasOwn(head, member.name) ? head[member.name] : undefined

    if (atHead === undefined) continue // package or task gone at head
    if (atBase === undefined || atBase !== atHead) touched.add(member.name)
  }

  for (const member of members) {
    if (!member.publishable) continue
    if (Object.hasOwn(base, member.name) || Object.hasOwn(head, member.name)) continue
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
const parseDryRunOutput = (stdout: string, context: string): DryRun => {
  let doc: { packages?: unknown; tasks?: unknown; turboVersion?: unknown }
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
    if (typeof taskId !== 'string' || !taskId.endsWith(BUILD_TASK_SUFFIX)) continue
    if (typeof name !== 'string' || name.length === 0) {
      throw new Error(`${context} output: a build task without a package name`)
    }
    if (typeof hash !== 'string' || hash.length === 0) {
      throw new Error(`${context} output: ${name}${BUILD_TASK_SUFFIX} has no hash`)
    }
    if (Object.hasOwn(matrix, name)) throw new Error(`${context} output: duplicate task for ${name}`)
    matrix[name] = hash
    if (typeof directory === 'string' && directory.length > 0) dirs[name] = directory
  }
  // Packages enumerated but no #build task parsed is task-format drift, not
  // an empty verdict — an empty matrix must never read as "nothing changed".
  if (doc.packages.length > 0 && Object.keys(matrix).length === 0) {
    throw new Error(
      `${context} output: ${doc.packages.length} package(s) enumerated but no ${BUILD_TASK_SUFFIX} task parsed — turbo's task format drifted`,
    )
  }
  return {
    packages: doc.packages as string[],
    matrix,
    dirs,
    engineVersion: typeof doc.turboVersion === 'string' ? doc.turboVersion : null,
  }
}

const engineSelfReportMatches = (run: DryRun, pinned: string): boolean =>
  run.engineVersion === null || run.engineVersion === pinned

const dryRun = async (cwd: string, pinnedVersion: string): Promise<DryRun> => {
  try {
    await Deno.lstat(TURBO)
  } catch {
    throw new Error(
      `turbo not present at ${TURBO} — run 'pnpm install --frozen-lockfile' (the gate runs the lockfile-installed binary, nothing else)`,
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
  const run = parseDryRunOutput(dec.decode(out.stdout), cwd)
  if (!engineSelfReportMatches(run, pinnedVersion)) {
    throw new Error(
      `turbo in ${cwd} self-reports version ${run.engineVersion}, not the lockfile pin ${pinnedVersion} — ` +
        `run 'pnpm install --frozen-lockfile'`,
    )
  }
  return run
}

/**
 * The lockfile is the engine-of-record: the resolved turbo version it names is
 * the version `pnpm install --frozen-lockfile` puts in node_modules, and the
 * selftest recomputes this exact value from these exact bytes. A pnpm major
 * bump that changes the schema breaks the assertion here before it can
 * silently redirect the verdict.
 */
const lockfileIsV9 = (lockfile: string): boolean => /^lockfileVersion:\s*['"]?9\.0['"]?\s*$/m.test(lockfile)

const lockfileTurboEntry = (lockfile: string): { specifier: string; version: string } | null => {
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
const assertTurboPin = (
  lockfile: string,
  resolvedTurboPackageJson: string,
  context: string,
): string => {
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
    throw new Error(`${context}: ${TURBO_MANIFEST} is not parseable JSON`)
  }
  if (resolved.version !== pinned.version) {
    throw new Error(
      `${context}: installed turbo ${String(resolved.version)} does not match the lockfile pin ${pinned.version} — ` +
        `run 'pnpm install --frozen-lockfile'`,
    )
  }
  return pinned.version
}

/**
 * The live pair, recomputed from source bytes wherever the gate or its
 * selftest runs: the lockfile's pin and the installed engine manifest must
 * agree (CI runs the selftest right after the frozen install). Returns the
 * pinned version so the spawns can also check the engine's own self-report.
 */
const assertLiveTurboPin = async (context: string): Promise<string> => {
  const [lockfile, resolvedTurbo] = await Promise.all([
    Deno.readTextFile(LOCKFILE),
    Deno.readTextFile(TURBO_MANIFEST).catch(() => '{}'),
  ])
  return assertTurboPin(lockfile, resolvedTurbo, context)
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
      publishable: manifest.private !== true,
    }
    : null
}

/**
 * Membership is turbo's: the union of the two dry-runs' tasks' directories,
 * with the head manifest's `private` bit deciding publishability. A taskless
 * turbo member (none exists today) still needs a directory for the R6
 * fallback, so only then are tracked manifests consulted to map its name to a
 * directory — and only names turbo enumerates qualify. A tracked manifest
 * turbo does not enumerate (a testResources fixture) is not a member, so it
 * can never demand an intent (R11).
 */
const readMembers = async (runs: readonly DryRun[]): Promise<readonly WorkspaceMember[]> => {
  const dirs = new Map<string, string>()
  for (const run of runs) {
    for (const [name, dir] of Object.entries(run.dirs)) dirs.set(name, dir)
  }
  const turboMembers = new Set(runs.flatMap((run) => run.packages))
  if ([...turboMembers].some((name) => !dirs.has(name))) {
    for (const manifestPath of await git(['ls-files', '*package.json', ':(exclude)repos/**'])) {
      const member = await readMember(manifestPath)
      if (member === null || !turboMembers.has(member.name) || dirs.has(member.name)) continue
      dirs.set(member.name, member.dir)
    }
  }
  return (await Promise.all(
    [...dirs.entries()].map(([, dir]) => readMember(`${dir}${MANIFEST_SUFFIX}`)),
  )).filter((member): member is WorkspaceMember => member !== null && dirs.get(member.name) === member.dir)
}
const extractBumpNames = (content: string): readonly string[] => {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/m)
  if (!match) return []
  const names = new Set<string>()
  for (const line of match[1].split(/\r?\n/)) {
    const parsed = line.match(/^\s*["']?([^"'\s:]+)["']?\s*:\s*([^#\s][^#]*?)\s*(?:#.*)?$/)
    if (parsed) names.add(parsed[1])
  }
  return [...names]
}

type LivenessViolation = {
  readonly path: string
  readonly pkg: string
}

const listPendingChangesetPaths = async (): Promise<readonly string[]> => {
  const out: string[] = []
  try {
    for await (const entry of Deno.readDir('.changeset')) {
      if (!entry.isFile) continue
      if (!entry.name.endsWith('.md')) continue
      if (entry.name === 'README.md') continue
      out.push(`.changeset/${entry.name}`)
    }
  } catch (error) {
    throw new Error(`cannot enumerate .changeset — refusing the empty verdict (fail closed): ${error}`)
  }
  return out.sort()
}

const livenessViolations = (
  members: readonly WorkspaceMember[],
  pending: readonly { path: string; content: string }[],
): readonly LivenessViolation[] => {
  const memberNames = new Set(members.map((m) => m.name))
  const violations: LivenessViolation[] = []
  for (const { path, content } of pending) {
    if (path === '.changeset/README.md') continue
    for (const pkg of extractBumpNames(content)) {
      if (!memberNames.has(pkg)) violations.push({ path, pkg })
    }
  }
  violations.sort((a, b) => a.path.localeCompare(b.path) || a.pkg.localeCompare(b.pkg))
  return violations
}

const reportLivenessViolations = (violations: readonly LivenessViolation[]): void => {
  for (const { path, pkg } of violations) {
    console.error(`::error::${path} names non-member package "${pkg}" — not a workspace member`)
  }
  console.error('')
  console.error('Each .changeset frontmatter key must name a live workspace package (any bump, none included).')
}

const main = async (baseArg: string | undefined): Promise<number> => {
  if (!baseArg) {
    console.error('usage: check-changeset.ts <base-sha-or-ref>')
    return 2
  }

  const pinnedVersion = await assertLiveTurboPin('check-changeset')

  const [baseSha] = await git(['rev-parse', '--verify', `${baseArg}^{commit}`])

  const baseDir = await Deno.makeTempDir({ prefix: 'changeset-base-' })
  try {
    await git(['worktree', 'add', '--detach', '--force', baseDir, baseSha])
  } catch (error) {
    await Deno.remove(baseDir, { recursive: true }).catch(() => {})
    throw error
  }
  let baseRun: DryRun
  let headRun: DryRun
  try {
    ;[baseRun, headRun] = await Promise.all([
      dryRun(baseDir, pinnedVersion),
      dryRun(Deno.cwd(), pinnedVersion),
    ])
  } finally {
    await git(['worktree', 'remove', '--force', baseDir]).catch(() => {
      console.error(`warning: could not remove the base worktree ${baseDir} — run 'git worktree prune'`)
    })
  }
  // A dry run that enumerates no workspace packages is a broken premise, not
  // an empty verdict (R9) — it must never read as "nothing changed".
  for (const side of [['base', baseRun], ['head', headRun]] as const) {
    if (side[1].packages.length === 0) {
      throw new Error(`turbo enumerated no workspace packages in the ${side[0]} run — refusing the empty verdict`)
    }
  }

  const [members, changedFiles, changesetPaths] = await Promise.all([
    readMembers([baseRun, headRun]),
    git(['diff', '--name-only', `${baseSha}...HEAD`]),
    git(['diff', '--name-only', '--diff-filter=AM', `${baseSha}...HEAD`, '--', '.changeset/*.md']),
  ])
  const changesets = await Promise.all(
    changesetPaths.filter((path) => path !== '.changeset/README.md').map((path) =>
      Deno.readTextFile(path).catch(() => '')
    ),
  )

  const { touched, missingIntent } = verdict({
    base: baseRun.matrix,
    head: headRun.matrix,
    members,
    changedFiles,
    changesets,
  })

  const pending = await Promise.all(
    (await listPendingChangesetPaths()).map(async (path) => ({
      path,
      content: await Deno.readTextFile(path).catch(() => ''),
    })),
  )
  const liveViolations = livenessViolations(members, pending)
  if (liveViolations.length > 0) reportLivenessViolations(liveViolations)

  if (touched.length === 0 && liveViolations.length === 0) {
    console.log(
      `changeset gate: no publishable package changed its turbo build hash — skipping (${members.length} member(s))`,
    )
    return 0
  }

  if (liveViolations.length > 0 || missingIntent.length > 0) {
    if (missingIntent.length > 0) reportMissingIntent(missingIntent)
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
  { name: '@scope/published', dir: 'packages/published', publishable: true },
  { name: '@scope/private', dir: 'packages/private', publishable: false },
  { name: '@scope/plugin', dir: 'omp/plugins/plugin', publishable: true },
  { name: '@scope/other', dir: 'packages/other', publishable: true },
  { name: '@scope/taskless', dir: 'packages/taskless', publishable: true },
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
    label: 'a private package is never demanded',
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
  // The next two rows share a shape on purpose: they pin the VERDICT's rule
  // that any observed hash difference demands a record, whatever the file
  // class. The re-hash semantics themselves (a devDependencies edit re-hashes;
  // a removed build script keeps a NONEXISTENT-command task and re-hashes)
  // are pinned only by the live probe matrix — a fixture cannot observe them.
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
    label: 'removing the build script keeps the task (its hash changed) and demands',
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
    label: 'a taskless publishable member falls back to its directory',
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
    label: 'a taskless publishable member with no changed file under it is not demanded',
    evidence: {
      base: { '@scope/published': H.before },
      head: { '@scope/published': H.before },
      members: MEMBERS,
      changesets: [],
      changedFiles: ['packages/published/src/a.ts'],
    },
    expect: { touched: [], missingIntent: [] },
  },
  {
    label: 'a multi-package intent frontmatter covers each name it lists',
    evidence: {
      base: { '@scope/published': H.before, '@scope/other': H.before },
      head: { '@scope/published': H.after, '@scope/other': H.after },
      members: MEMBERS,
      changesets: ['---\n"@scope/other": minor\n"@scope/published": patch\n---\n'],
      changedFiles: ['packages/other/src/b.ts', 'packages/published/src/a.ts'],
    },
    expect: { touched: ['@scope/other', '@scope/published'], missingIntent: [] },
  },
  {
    label: 'a package un-privated in the PR is publishable at head and its re-hash demands its first record',
    evidence: {
      base: { '@scope/unprivated': H.before },
      head: { '@scope/unprivated': H.after },
      members: [...MEMBERS, { name: '@scope/unprivated', dir: 'packages/unprivated', publishable: true }],
      changesets: [],
      changedFiles: ['packages/unprivated/package.json'],
    },
    expect: { touched: ['@scope/unprivated'], missingIntent: ['@scope/unprivated'] },
  },
]
const LIVENESS_FIXTURES: readonly {
  label: string
  members: readonly WorkspaceMember[]
  pending: readonly { path: string; content: string }[]
  expect: readonly LivenessViolation[]
}[] = [
  {
    label: 'dead patch name fails',
    members: MEMBERS,
    pending: [{ path: '.changeset/dead-patch.md', content: '---\n"@scope/dead": patch\n---\nbody\n' }],
    expect: [{ path: '.changeset/dead-patch.md', pkg: '@scope/dead' }],
  },
  {
    label: 'dead none name fails (none is a bump, not absence)',
    members: MEMBERS,
    pending: [{ path: '.changeset/dead-none.md', content: '---\n"@scope/dead": none\n---\nbody\n' }],
    expect: [{ path: '.changeset/dead-none.md', pkg: '@scope/dead' }],
  },
  {
    label: 'live names pass',
    members: MEMBERS,
    pending: [
      { path: '.changeset/live-one.md', content: '---\n"@scope/published": patch\n---\n' },
      { path: '.changeset/live-two.md', content: '---\n"@scope/other": minor\n"@scope/plugin": major\n---\n' },
    ],
    expect: [],
  },
  {
    label: 'an intent untouched by the PR but stale at head still fails (all-pending scope)',
    members: MEMBERS,
    pending: [
      { path: '.changeset/untouched-live.md', content: '---\n"@scope/published": patch\n---\n' },
      { path: '.changeset/stale-untouched.md', content: '---\n"@scope/dead": patch\n---\n' },
    ],
    expect: [{ path: '.changeset/stale-untouched.md', pkg: '@scope/dead' }],
  },
  {
    label: 'README.md is ignored even when it names a non-member',
    members: MEMBERS,
    pending: [
      { path: '.changeset/README.md', content: '---\n"@scope/dead": patch\n---\n' },
      { path: '.changeset/live.md', content: '---\n"@scope/published": patch\n---\n' },
    ],
    expect: [],
  },
  {
    label: 'a file with live and dead names reports only the dead one',
    members: MEMBERS,
    pending: [{ path: '.changeset/mixed.md', content: '---\n"@scope/published": patch\n"@scope/dead": minor\n---\n' }],
    expect: [{ path: '.changeset/mixed.md', pkg: '@scope/dead' }],
  },
]

const expectsThrow = (fn: () => unknown): boolean => {
  try {
    fn()
    return false
  } catch {
    return true
  }
}

const selftest = async (): Promise<number> => {
  const failures: string[] = []

  for (const { label, evidence, expect } of FIXTURES) {
    const got = verdict(evidence)
    if (JSON.stringify(got) !== JSON.stringify(expect)) {
      failures.push(`  ${label}:\n    expected ${JSON.stringify(expect)}\n    got      ${JSON.stringify(got)}`)
    }
  }

  for (const { label, members, pending, expect } of LIVENESS_FIXTURES) {
    const got = livenessViolations(members, pending)
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
      'dry-run JSON parses into a matrix',
      JSON.stringify(parseDryRunOutput(DRY_FIXTURE, 'fixture').matrix) ===
        JSON.stringify({ '@scope/published': H.before }),
    ],
    ['a task without a hash fails closed', expectsThrow(() => parseDryRunOutput(DRY_BROKEN, 'fixture'))],
    ['non-JSON dry-run output fails closed', expectsThrow(() => parseDryRunOutput('turbo: not json', 'fixture'))],
    [
      'a dry run missing a tasks array fails closed',
      expectsThrow(() => parseDryRunOutput('{"packages":[]}', 'fixture')),
    ],
    [
      'a build task without a package name fails closed',
      expectsThrow(() =>
        parseDryRunOutput(
          JSON.stringify({
            packages: ['@scope/published'],
            tasks: [{ taskId: '@scope/#build', hash: H.before, directory: 'packages/published' }],
          }),
          'fixture',
        )
      ),
    ],
    [
      'a duplicate build task fails closed',
      expectsThrow(() =>
        parseDryRunOutput(
          JSON.stringify({
            packages: ['@scope/published'],
            tasks: [
              {
                taskId: '@scope/published#build',
                package: '@scope/published',
                hash: H.before,
                directory: 'packages/published',
              },
              {
                taskId: '@scope/published#build',
                package: '@scope/published',
                hash: H.after,
                directory: 'packages/published',
              },
            ],
          }),
          'fixture',
        )
      ),
    ],
    [
      'non-build tasks are skipped while build rows are kept',
      JSON.stringify(
        parseDryRunOutput(
          JSON.stringify({
            turboVersion: '2.10.5',
            packages: ['@scope/published'],
            tasks: [
              {
                taskId: '@scope/published#test',
                package: '@scope/published',
                hash: 'deadbeef',
                directory: 'packages/published',
              },
              {
                taskId: '@scope/published#build',
                package: '@scope/published',
                hash: H.before,
                directory: 'packages/published',
              },
            ],
          }),
          'fixture',
        ).matrix,
      ) === JSON.stringify({ '@scope/published': H.before }),
    ],
    [
      'packages without any build task fail closed as task-format drift',
      expectsThrow(() =>
        parseDryRunOutput(
          JSON.stringify({
            packages: ['@scope/published'],
            tasks: [{ taskId: '@scope/published#test', package: '@scope/published', hash: H.before }],
          }),
          'fixture',
        )
      ),
    ],
    [
      'engine self-report is carried and checked against the pin',
      parseDryRunOutput(DRY_FIXTURE, 'fixture').engineVersion === '2.10.5' &&
      engineSelfReportMatches(parseDryRunOutput(DRY_FIXTURE, 'fixture'), '2.10.5') &&
      !engineSelfReportMatches({ ...parseDryRunOutput(DRY_FIXTURE, 'fixture'), engineVersion: '9.9.9' }, '2.10.5') &&
      engineSelfReportMatches({ packages: [], matrix: {}, dirs: {}, engineVersion: null }, '2.10.5'),
    ],
    [
      'pin check accepts a matching lockfile+install',
      expectsThrow(() => assertTurboPin(FIXTURE_V9, JSON.stringify({ version: '9.9.9' }), 'selftest-fixture')) &&
      !expectsThrow(() => assertTurboPin(FIXTURE_V9, JSON.stringify({ version: '2.10.5' }), 'selftest-fixture')),
    ],
  ] as const
  for (const [label, ok] of checks) {
    if (!ok) failures.push(`  ${label}`)
  }

  // The live pair, recomputed from source bytes: the lockfile's pin and the
  // installed engine manifest must agree wherever the selftest runs (CI runs
  // it right after the frozen install). This is the same assertion main()
  // enforces before any verdict.
  try {
    await assertLiveTurboPin('selftest')
  } catch (error) {
    failures.push(`  live pin check: ${error instanceof Error ? error.message : String(error)}`)
  }

  if (failures.length > 0) {
    console.error(
      `check-changeset: selftest FAILED (${failures.length}/${
        FIXTURES.length + LIVENESS_FIXTURES.length + checks.length + 1
      })\n`,
    )
    for (const failure of failures) console.error(failure)
    return 1
  }
  console.log(
    `check-changeset: selftest ok (${FIXTURES.length} verdict rows + ${LIVENESS_FIXTURES.length} liveness rows + ${
      checks.length + 1
    } mechanism rows)`,
  )
  return 0
}

try {
  Deno.exitCode = Deno.args.includes('--selftest') ? await selftest() : await main(Deno.args[0])
} catch (error) {
  console.error(`::error::${error instanceof Error ? error.message : String(error)}`)
  Deno.exitCode = 1
}
