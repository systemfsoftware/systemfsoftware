#!/usr/bin/env -S deno run --allow-run=git --allow-read
import { workspaceMembers } from './workspace-members.ts'

type WorkspaceMember = {
  readonly name: string
  readonly dir: string
  readonly releasable: boolean
}

type Evidence = {
  readonly changedFiles: readonly string[]
  readonly members: readonly WorkspaceMember[]
  readonly changesets: readonly string[]
}

type Verdict = {
  readonly touched: string[]
  readonly missingIntent: string[]
}

const BUMPS = ['none', 'patch', 'minor', 'major'] as const
const MANIFEST_SUFFIX = '/package.json'

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

export const verdict = ({ changedFiles, members, changesets }: Evidence): Verdict => {
  const touched = [
    ...new Set(
      changedFiles
        .map((file) => memberOwning(file, members))
        .filter((member): member is WorkspaceMember => member !== null && member.releasable)
        .map(({ name }) => name),
    ),
  ].sort()

  return {
    touched,
    missingIntent: touched.filter((name) => !changesets.some((changeset) => declaresBumpFor(changeset, name))),
  }
}

const readMember = async (manifestPath: string): Promise<WorkspaceMember | null> => {
  const manifest = JSON.parse(await Deno.readTextFile(manifestPath)) as { name?: unknown; private?: unknown }
  return typeof manifest.name === 'string' && manifest.name.length > 0
    ? {
      name: manifest.name,
      dir: manifestPath.slice(0, -MANIFEST_SUFFIX.length),
      releasable: manifest.private !== true,
    }
    : null
}

const reportMissingIntent = (missingIntent: readonly string[]) => {
  console.error(
    `::error::This PR changes ${missingIntent.length} publishable package(s) that no changeset in it names: ${
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
    `Bumps are ${BUMPS.join(' | ')}. \`none\` records a touch that releases nothing; on a ` +
      'behaviour-visible change it is the silent non-release this gate exists to catch (REPO-R2).',
  )
}

const main = async (baseRef: string | undefined): Promise<number> => {
  if (!baseRef) {
    console.error('usage: check-changeset.ts <base-ref>')
    return 2
  }

  const range = `origin/${baseRef}...HEAD`
  const changedFiles = await git(['diff', '--name-only', range])
  const manifestPaths = workspaceMembers(await git(['ls-files', '*package.json', ':(exclude)repos/**']))
  const members = (await Promise.all(manifestPaths.map(readMember)))
    .filter((member): member is WorkspaceMember => member !== null)

  const changesetPaths = (await git(['diff', '--name-only', '--diff-filter=AM', range, '--', '.changeset/*.md']))
    .filter((path) => path !== '.changeset/README.md')
  const changesets = await Promise.all(
    changesetPaths.map((path) => Deno.readTextFile(path).catch(() => '')),
  )

  const { touched, missingIntent } = verdict({ changedFiles, members, changesets })

  if (touched.length === 0) {
    console.log(`no publishable workspace package touched — skipping (${members.length} member(s) considered)`)
    return 0
  }

  if (missingIntent.length > 0) {
    reportMissingIntent(missingIntent)
    return 1
  }

  console.log(
    `changeset gate: ${touched.length} publishable package(s) touched, each named by an intent — ${touched.join(', ')}`,
  )
  return 0
}

const MEMBERS: readonly WorkspaceMember[] = [
  { name: '@scope/published', dir: 'packages/published', releasable: true },
  { name: '@scope/private', dir: 'packages/private', releasable: false },
  { name: '@scope/plugin', dir: 'omp/plugins/plugin', releasable: true },
]

const FIXTURES: readonly { label: string; evidence: Evidence; expect: Verdict }[] = [
  {
    label: 'an intent naming the touched package satisfies the gate',
    evidence: {
      changedFiles: ['packages/published/src/a.ts'],
      members: MEMBERS,
      changesets: ['---\n"@scope/published": patch\n---\n'],
    },
    expect: { touched: ['@scope/published'], missingIntent: [] },
  },
  {
    label: 'no changeset at all leaves the touched package unnamed',
    evidence: { changedFiles: ['packages/published/src/a.ts'], members: MEMBERS, changesets: [] },
    expect: { touched: ['@scope/published'], missingIntent: ['@scope/published'] },
  },
  {
    label: 'an intent for another package is not cover',
    evidence: {
      changedFiles: ['packages/published/src/a.ts'],
      members: MEMBERS,
      changesets: ['---\n"@scope/other": patch\n---\n'],
    },
    expect: { touched: ['@scope/published'], missingIntent: ['@scope/published'] },
  },
  {
    label: 'a package that cannot release is never demanded',
    evidence: { changedFiles: ['packages/private/src/a.ts'], members: MEMBERS, changesets: [] },
    expect: { touched: [], missingIntent: [] },
  },
  {
    label: 'a publishable package outside packages/ is demanded',
    evidence: { changedFiles: ['omp/plugins/plugin/src/a.ts'], members: MEMBERS, changesets: [] },
    expect: { touched: ['@scope/plugin'], missingIntent: ['@scope/plugin'] },
  },
  {
    label: 'a manifest touch counts as touching its own package',
    evidence: { changedFiles: ['packages/published/package.json'], members: MEMBERS, changesets: [] },
    expect: { touched: ['@scope/published'], missingIntent: ['@scope/published'] },
  },
  {
    label: 'a file outside every member belongs to no package',
    evidence: {
      changedFiles: ['README.md', 'scripts/guards/check-changeset.ts'],
      members: MEMBERS,
      changesets: [],
    },
    expect: { touched: [], missingIntent: [] },
  },
  {
    label: 'none is an intent, not an absence',
    evidence: {
      changedFiles: ['packages/published/src/a.ts'],
      members: MEMBERS,
      changesets: ['---\n"@scope/published": none\n---\n'],
    },
    expect: { touched: ['@scope/published'], missingIntent: [] },
  },
  {
    label: 'a name that prefixes another is not mistaken for it',
    evidence: {
      changedFiles: ['packages/published/src/a.ts'],
      members: MEMBERS,
      changesets: ['---\n"@scope/published-extra": patch\n---\n'],
    },
    expect: { touched: ['@scope/published'], missingIntent: ['@scope/published'] },
  },
  {
    label: 'two touched packages need two names',
    evidence: {
      changedFiles: ['packages/published/src/a.ts', 'omp/plugins/plugin/src/b.ts'],
      members: MEMBERS,
      changesets: ['---\n"@scope/published": minor\n---\n'],
    },
    expect: { touched: ['@scope/plugin', '@scope/published'], missingIntent: ['@scope/plugin'] },
  },
]

const selftest = (): number => {
  const failures = FIXTURES.flatMap(({ label, evidence, expect }) => {
    const got = verdict(evidence)
    return JSON.stringify(got) === JSON.stringify(expect)
      ? []
      : [`  ${label}:\n    expected ${JSON.stringify(expect)}\n    got      ${JSON.stringify(got)}`]
  })

  if (failures.length > 0) {
    console.error(`check-changeset: selftest FAILED (${failures.length}/${FIXTURES.length})\n`)
    for (const failure of failures) console.error(failure)
    return 1
  }

  console.log(`check-changeset: selftest ok (${FIXTURES.length} fixtures)`)
  return 0
}

try {
  Deno.exitCode = Deno.args.includes('--selftest') ? selftest() : await main(Deno.args[0])
} catch (error) {
  console.error(`::error::${error instanceof Error ? error.message : String(error)}`)
  Deno.exitCode = 1
}
