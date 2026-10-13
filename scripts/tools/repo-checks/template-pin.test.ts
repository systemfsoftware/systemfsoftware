// template-pin reads every pin site and requires one SHA reachable from
// main. These tests drive the shipped CLI against real git repositories under
// .context, so the fetch and the ancestry check run for real: a local bare
// repository is the remote.
import { assertEquals, assertStringIncludes } from '@std/assert'
import { dirname, fromFileUrl, join } from '@std/path'

const HERE = dirname(fromFileUrl(import.meta.url))
const REPO = join(HERE, '..', '..', '..')
const CLI = join(HERE, 'cli.ts')
const CONFIG = join(HERE, '..', '..', 'deno.jsonc')
const SCRATCH = join(REPO, '.context', 'repo-checks-tests')
const TEMPLATE = join('templates', 'consumer')

const callerPath = (root: string, stem: string): string => join(root, TEMPLATE, '.github', 'workflows', `${stem}.yml`)
const packsPath = (root: string): string => join(root, TEMPLATE, '.compound-engineering', 'config.yaml')
const lockPath = (root: string): string => join(root, TEMPLATE, 'flake.lock')

interface Ran {
  readonly code: number
  readonly stdout: string
  readonly stderr: string
}

const decoder = new TextDecoder()

const run = async (
  cwd: string,
  command: string,
  args: readonly string[],
  env?: Record<string, string>,
): Promise<Ran> => {
  const options: Deno.CommandOptions = {
    args: [...args],
    cwd,
    stdout: 'piped',
    stderr: 'piped',
    ...(env === undefined ? {} : { env }),
  }
  const out = await new Deno.Command(command, options).output()
  return { code: out.code, stdout: decoder.decode(out.stdout), stderr: decoder.decode(out.stderr) }
}

const pass = async (cwd: string, command: string, args: readonly string[]): Promise<void> => {
  const ran = await run(cwd, command, args)
  if (ran.code !== 0) throw new Error(`${command} ${args.join(' ')} failed (${ran.code}): ${ran.stderr}`)
}

interface Fixture {
  /** A checkout (with an `origin` remote) a consumer-like pin lives in. */
  readonly root: string
  /** The bare repository `origin` points at. */
  readonly bare: string
  /** The tip of origin's main. */
  readonly main: string
  /** A commit that exists locally but was never pushed. */
  readonly ahead: string
}

const fixture = async (): Promise<Fixture> => {
  await Deno.mkdir(SCRATCH, { recursive: true })
  const dir = await Deno.makeTempDir({ dir: SCRATCH, prefix: 'pin-' })
  const root = join(dir, 'work')
  const bare = join(dir, 'origin.git')
  await Deno.mkdir(root)
  const git = (args: readonly string[]) => pass(root, 'git', args)
  const identity = ['-c', 'user.name=t', '-c', 'user.email=t@t']
  await git(['init', '-q', '-b', 'main'])
  await git([...identity, 'commit', '-q', '--no-verify', '--allow-empty', '-m', 'base'])
  const main = (await run(root, 'git', ['rev-parse', 'HEAD'])).stdout.trim()
  await git(['init', '-q', '--bare', bare])
  await git(['remote', 'add', 'origin', bare])
  await git(['push', '-q', 'origin', 'main'])
  await git([...identity, 'commit', '-q', '--no-verify', '--allow-empty', '-m', 'ahead'])
  const ahead = (await run(root, 'git', ['rev-parse', 'HEAD'])).stdout.trim()
  return { root, bare, main, ahead }
}

const STEMS = ['checks', 'commitlint', 'nix', 'mutation'] as const
type Stem = typeof STEMS[number]

const pin = (sha: string): Record<Stem | 'packs' | 'lock', string> => ({
  checks: sha,
  commitlint: sha,
  nix: sha,
  mutation: sha,
  packs: sha,
  lock: sha,
})

const callerRef = (stem: string, sha: string): string =>
  `systemfsoftware/systemfsoftware/.github/workflows/reusable-${stem}.yml@${sha}`

const callerYaml = (stem: string, sha: string, comment: string | null): string =>
  `name: ${stem}

on:
  push:
    branches: [main]

jobs:
  ${stem}:
    name: ${stem}
    permissions:
      contents: read
    uses: ${callerRef(stem, sha)}${comment === null ? '' : ` ${comment}`}
`

const withBlockScalarDecoy = (stem: string, text: string, decoySha: string): string =>
  text.replace(`name: ${stem}\n`, `name: ${stem}\ndescription: |\n  uses: ${callerRef(stem, decoySha)} # main\n`)

const flowJobCallerYaml = (stem: string, sha: string): string =>
  `name: ${stem}

on:
  push:
    branches: [main]

jobs: {${stem}: {name: ${stem}, permissions: {contents: read}, uses: ${callerRef(stem, sha)}}}
`

const packsYaml = (sha: string): string =>
  `packs:
  - source: https://github.com/systemfsoftware/systemfsoftware
    ref: ${sha}
    path: compound-packs
    pack:
      - cell-architecture
`

const lockJson = (sha: string): string =>
  `${
    JSON.stringify(
      {
        nodes: {
          root: { inputs: { nixpkgs: ['systemfsoftware', 'nixpkgs'], systemfsoftware: 'systemfsoftware' } },
          systemfsoftware: {
            inputs: {},
            locked: {
              lastModified: 1,
              narHash: 'sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
              owner: 'systemfsoftware',
              repo: 'systemfsoftware',
              rev: sha,
              type: 'github',
            },
            original: { owner: 'systemfsoftware', repo: 'systemfsoftware', type: 'github' },
          },
        },
        root: 'root',
        version: 7,
      },
      null,
      2,
    )
  }\n`

const flakeNix = `{
  inputs = {
    systemfsoftware.url = "github:systemfsoftware/systemfsoftware";
    nixpkgs.follows = "systemfsoftware/nixpkgs";
  };

  outputs = { self, nixpkgs, systemfsoftware }: { };
}
`

const flakePath = (root: string): string => join(root, TEMPLATE, 'flake.nix')

const writePin = async (
  root: string,
  shas: Record<Stem | 'packs' | 'lock', string>,
  comments: Partial<Record<Stem, string | null>> = {},
): Promise<void> => {
  await Deno.mkdir(dirname(callerPath(root, 'checks')), { recursive: true })
  for (const stem of STEMS) {
    const comment = Object.hasOwn(comments, stem) ? comments[stem]! : '# main'
    await Deno.writeTextFile(callerPath(root, stem), callerYaml(stem, shas[stem], comment))
  }
  await Deno.mkdir(dirname(packsPath(root)), { recursive: true })
  await Deno.writeTextFile(packsPath(root), packsYaml(shas.packs))
  await Deno.writeTextFile(lockPath(root), lockJson(shas.lock))
  await Deno.writeTextFile(flakePath(root), flakeNix)
}

const PIN_ARGS = ['run', `--config=${CONFIG}`, '--allow-read', '--allow-env', '--allow-run=git', CLI, 'template-pin']

const checkPin = (root: string, env?: Record<string, string>): Promise<Ran> => run(root, Deno.execPath(), PIN_ARGS, env)

Deno.test('Should_Hold_When_AllSixPinsNameOneCommitReachableFromMain', async () => {
  const { root, main } = await fixture()
  await writePin(root, pin(main))
  const ran = await checkPin(root)
  assertEquals(ran.code, 0)
  assertStringIncludes(ran.stdout, 'holds')
})

Deno.test('Should_NameBothSites_When_TheChecksCallerAndThePacksRefDiffer', async () => {
  const { root, main, ahead } = await fixture()
  await writePin(root, { ...pin(main), checks: ahead })
  const ran = await checkPin(root)
  assertEquals(ran.code, 1)
  assertStringIncludes(ran.stderr, main)
  assertStringIncludes(ran.stderr, ahead)
  assertStringIncludes(ran.stderr, '.github/workflows/checks.yml')
  assertStringIncludes(ran.stderr, '.compound-engineering/config.yaml')
})

Deno.test('Should_Refuse_When_NoPinIsReachableFromMain', async () => {
  const { root, ahead } = await fixture()
  await writePin(root, pin(ahead))
  const ran = await checkPin(root)
  assertEquals(ran.code, 1)
  assertStringIncludes(ran.stderr, 'not reachable from main')
})

Deno.test('Should_Refuse_When_ThePinNamesNoCommitInTheFetchedHistory', async () => {
  const { root } = await fixture()
  const absent = 'f'.repeat(40)
  await writePin(root, pin(absent))
  const ran = await checkPin(root)
  assertEquals(ran.code, 1)
  assertStringIncludes(ran.stderr, `${absent} names no commit in origin/main's history`)
})

Deno.test('Should_Refuse_When_ThePinNamesAnAnnotatedTagOnMain', async () => {
  const { root } = await fixture()
  await pass(root, 'git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'tag', '-a', 'v1', '-m', 'v1', 'origin/main'])
  const tag = (await run(root, 'git', ['rev-parse', 'v1'])).stdout.trim()
  await writePin(root, pin(tag))
  const ran = await checkPin(root)
  assertEquals(ran.code, 1)
  assertStringIncludes(ran.stderr, `${tag} names a tag, not a commit`)
})

Deno.test('Should_NameTheSecondPacksEntry_When_ItLoadsPacksFromAnotherRepository', async () => {
  const { root, main } = await fixture()
  await writePin(root, pin(main))
  const second = packsYaml(main).replace('packs:\n', '').replace(
    'github.com/systemfsoftware/systemfsoftware',
    'github.com/attacker/packs',
  )
  await Deno.writeTextFile(packsPath(root), `${packsYaml(main)}${second}`)
  const ran = await checkPin(root)
  assertEquals(ran.code, 1)
  assertStringIncludes(ran.stderr, 'packs[1]: the pack `source` is https://github.com/attacker/packs')
})

Deno.test('Should_NameTheFlake_When_ItsSystemfsoftwareInputPointsElsewhere', async () => {
  const { root, main } = await fixture()
  await writePin(root, pin(main))
  await Deno.writeTextFile(
    flakePath(root),
    flakeNix.replace('github:systemfsoftware/systemfsoftware', 'github:attacker/systemfsoftware'),
  )
  const ran = await checkPin(root)
  assertEquals(ran.code, 1)
  assertStringIncludes(ran.stderr, 'flake.nix: its inputs block is not exactly')
})

Deno.test('Should_NameTheFlake_When_ItDeclaresASecondInputOutsideTheBlock', async () => {
  const { root, main } = await fixture()
  await writePin(root, pin(main))
  await Deno.writeTextFile(
    flakePath(root),
    flakeNix.replace('  outputs', '  inputs.extra.url = "github:attacker/extra";\n\n  outputs'),
  )
  const ran = await checkPin(root)
  assertEquals(ran.code, 1)
  assertStringIncludes(ran.stderr, 'flake.nix: it assigns inputs 2 times')
})

Deno.test('Should_Hold_When_TheFlakeOutputsReadAnInput', async () => {
  const { root, main } = await fixture()
  await writePin(root, pin(main))
  await Deno.writeTextFile(
    flakePath(root),
    flakeNix.replace(
      'outputs = { self, nixpkgs, systemfsoftware }: { };',
      'outputs = inputs: { lib = inputs.nixpkgs.lib; };',
    ),
  )
  const ran = await checkPin(root)
  assertEquals(ran.code, 0, ran.stderr)
})

Deno.test('Should_Hold_When_AFlakeCommentLineMentionsInputs', async () => {
  const { root, main } = await fixture()
  await writePin(root, pin(main))
  await Deno.writeTextFile(
    flakePath(root),
    flakeNix.replace(
      '  outputs',
      '  # inputs = { other.url = "x"; }; stays above\n  # and inputs.extra too\n  outputs',
    ),
  )
  const ran = await checkPin(root)
  assertEquals(ran.code, 0, ran.stderr)
})

Deno.test('Should_NameTheLock_When_ItsOriginalPinsARevTheFlakeDoesNotName', async () => {
  const { root, main } = await fixture()
  await writePin(root, pin(main))
  const lock = JSON.parse(await Deno.readTextFile(lockPath(root))) as {
    nodes: { systemfsoftware: { original: Record<string, string> } }
  }
  lock.nodes.systemfsoftware.original['rev'] = main
  await Deno.writeTextFile(lockPath(root), `${JSON.stringify(lock, null, 2)}\n`)
  const ran = await checkPin(root)
  assertEquals(ran.code, 1)
  assertStringIncludes(ran.stderr, "`original` differs from templates/consumer/flake.nix's systemfsoftware input")
})

Deno.test('Should_NameTheLockRootInputs_When_TheyAddAnInputTheFlakeDoesNotDeclare', async () => {
  const { root, main } = await fixture()
  await writePin(root, pin(main))
  const lock = JSON.parse(await Deno.readTextFile(lockPath(root))) as {
    nodes: { root: { inputs: Record<string, unknown> } }
  }
  lock.nodes.root.inputs['extra'] = 'extra'
  await Deno.writeTextFile(lockPath(root), `${JSON.stringify(lock, null, 2)}\n`)
  const ran = await checkPin(root)
  assertEquals(ran.code, 1)
  assertStringIncludes(ran.stderr, "its root inputs differ from templates/consumer/flake.nix's inputs")
})

Deno.test('Should_Hold_When_TheLockWritesItsKeysInAnotherOrder', async () => {
  const { root, main } = await fixture()
  await writePin(root, pin(main))
  const lock = JSON.parse(await Deno.readTextFile(lockPath(root))) as {
    nodes: { root: { inputs: Record<string, unknown> }; systemfsoftware: { original: Record<string, string> } }
  }
  lock.nodes.systemfsoftware.original = { type: 'github', repo: 'systemfsoftware', owner: 'systemfsoftware' }
  lock.nodes.root.inputs = { systemfsoftware: 'systemfsoftware', nixpkgs: ['systemfsoftware', 'nixpkgs'] }
  await Deno.writeTextFile(lockPath(root), `${JSON.stringify(lock, null, 2)}\n`)
  const ran = await checkPin(root)
  assertEquals(ran.code, 0, ran.stderr)
})

Deno.test('Should_NameTheFile_When_AUsesRefHasNoMainComment', async () => {
  const { root, main } = await fixture()
  await writePin(root, pin(main), { checks: null })
  const ran = await checkPin(root)
  assertEquals(ran.code, 1)
  assertStringIncludes(ran.stderr, '.github/workflows/checks.yml')
  assertStringIncludes(ran.stderr, '# main')
})

Deno.test('Should_BeUndecided_When_TheRemoteCannotBeRead', async () => {
  const { root, bare, main } = await fixture()
  await writePin(root, pin(main))
  await pass(root, 'git', ['remote', 'set-url', 'origin', join(dirname(bare), 'no-such-repo.git')])
  const ran = await checkPin(root)
  assertEquals(ran.code, 2)
  assertStringIncludes(ran.stderr, 'undecided')
  assertStringIncludes(ran.stderr, 'git fetch origin main failed')
})

Deno.test('Should_NameTheFifthCaller_When_ItPinsADifferentCommit', async () => {
  const { root, main, ahead } = await fixture()
  await writePin(root, pin(main))
  await Deno.writeTextFile(
    join(root, 'templates', 'consumer', '.github', 'workflows', 'release.yaml'),
    callerYaml('release', ahead, '# main'),
  )
  const ran = await checkPin(root)
  assertEquals(ran.code, 1)
  assertStringIncludes(ran.stderr, '.github/workflows/release.yaml')
  assertStringIncludes(ran.stderr, ahead)
})

Deno.test('Should_BeUndecided_When_TheHistoryIsShallow', async () => {
  const { root, bare, main, ahead } = await fixture()
  await pass(root, 'git', ['push', '-q', 'origin', 'main'])
  const shallow = join(dirname(root), 'shallow')
  await pass(root, 'git', ['clone', '-q', '--depth', '1', '--branch', 'main', `file://${bare}`, shallow])
  assertEquals((await run(shallow, 'git', ['rev-parse', 'HEAD'])).stdout.trim(), ahead)
  await writePin(shallow, pin(main))
  const ran = await checkPin(shallow)
  assertEquals(ran.code, 2)
  assertStringIncludes(ran.stderr, 'undecided')
  assertStringIncludes(ran.stderr, 'git fetch --filter=tree:0 --unshallow')
})

Deno.test('Should_NameTheCaller_When_ADecoyUsesLineCarriesThePin', async () => {
  const { root, main, ahead } = await fixture()
  await writePin(root, pin(main))
  await Deno.writeTextFile(
    callerPath(root, 'checks'),
    withBlockScalarDecoy('checks', callerYaml('checks', ahead, '# main'), main),
  )
  const ran = await checkPin(root)
  assertEquals(ran.code, 1)
  assertStringIncludes(ran.stderr, '.github/workflows/checks.yml')
})

Deno.test('Should_NameTheCaller_When_ItsOnlyUsesLineIsNotItsJobRef', async () => {
  const { root, main, ahead } = await fixture()
  await writePin(root, pin(main))
  await Deno.writeTextFile(
    callerPath(root, 'checks'),
    withBlockScalarDecoy('checks', flowJobCallerYaml('checks', ahead), main),
  )
  const ran = await checkPin(root)
  assertEquals(ran.code, 1)
  assertStringIncludes(ran.stderr, '.github/workflows/checks.yml')
})

Deno.test('Should_NameTheCaller_When_ItsJobHasNoUsesLine', async () => {
  const { root, main } = await fixture()
  await writePin(root, pin(main))
  await Deno.writeTextFile(
    callerPath(root, 'checks'),
    callerYaml('checks', main, '# main').replace(/^\s*uses:.*\n/m, ''),
  )
  const ran = await checkPin(root)
  assertEquals(ran.code, 1)
  assertStringIncludes(ran.stderr, '.github/workflows/checks.yml')
  assertStringIncludes(ran.stderr, 'no `uses:` line')
})

Deno.test('Should_BeUndecided_When_ACallerCannotBeParsed', async () => {
  const { root, main } = await fixture()
  await writePin(root, pin(main))
  const broken = callerYaml('checks', main, '# main').replace(
    '    permissions:\n      contents: read\n',
    '    permissions: [\n',
  )
  await Deno.writeTextFile(callerPath(root, 'checks'), broken)
  const ran = await checkPin(root)
  assertEquals(ran.code, 2)
  assertStringIncludes(ran.stderr, 'undecided')
  assertStringIncludes(ran.stderr, '.github/workflows/checks.yml')
  assertStringIncludes(ran.stderr, 'unparseable YAML')
})

Deno.test('Should_NameThePacksConfig_When_TheFileIsAbsent', async () => {
  const { root, main } = await fixture()
  await writePin(root, pin(main))
  await Deno.remove(packsPath(root))
  const ran = await checkPin(root)
  assertEquals(ran.code, 1)
  assertStringIncludes(ran.stderr, '.compound-engineering/config.yaml')
  assertStringIncludes(ran.stderr, 'missing')
})

Deno.test('Should_BeUndecided_When_ThePacksConfigIsNotAMapping', async () => {
  const { root, main } = await fixture()
  await writePin(root, pin(main))
  await Deno.writeTextFile(
    packsPath(root),
    `- source: https://github.com/systemfsoftware/systemfsoftware\n  ref: ${main}\n`,
  )
  const ran = await checkPin(root)
  assertEquals(ran.code, 2)
  assertStringIncludes(ran.stderr, '.compound-engineering/config.yaml: not a mapping')
})

Deno.test('Should_NameThePacksConfig_When_ItsEntryHasNoRef', async () => {
  const { root, main } = await fixture()
  await writePin(root, pin(main))
  await Deno.writeTextFile(
    packsPath(root),
    'packs:\n  - source: https://github.com/systemfsoftware/systemfsoftware\n    path: compound-packs\n',
  )
  const ran = await checkPin(root)
  assertEquals(ran.code, 1)
  assertStringIncludes(
    ran.stderr,
    '.compound-engineering/config.yaml packs[0]: the pack `ref` is not a 40 lower-hex sha',
  )
})

Deno.test('Should_NameThePacksConfig_When_ItListsNoPack', async () => {
  for (const packs of ['packs: []\n', 'other: true\n']) {
    const { root, main } = await fixture()
    await writePin(root, pin(main))
    await Deno.writeTextFile(packsPath(root), packs)
    const ran = await checkPin(root)
    assertEquals(ran.code, 1)
    assertStringIncludes(ran.stderr, '.compound-engineering/config.yaml: no pack entry with a `ref`')
  }
})

Deno.test('Should_NameThePacksConfig_When_ItsRefIsNotA40LowerHexSha', async () => {
  const { root, main } = await fixture()
  await writePin(root, pin(main))
  await Deno.writeTextFile(packsPath(root), packsYaml(main.slice(0, 7)))
  const ran = await checkPin(root)
  assertEquals(ran.code, 1)
  assertStringIncludes(ran.stderr, '.compound-engineering/config.yaml')
  assertStringIncludes(ran.stderr, '40 lower-hex')
})

Deno.test('Should_NameTheLock_When_TheFileIsAbsent', async () => {
  const { root, main } = await fixture()
  await writePin(root, pin(main))
  await Deno.remove(lockPath(root))
  const ran = await checkPin(root)
  assertEquals(ran.code, 1)
  assertStringIncludes(ran.stderr, 'flake.lock')
  assertStringIncludes(ran.stderr, 'missing')
})

Deno.test('Should_NameTheLock_When_ItsSystemfsoftwareNodeHasNoRev', async () => {
  const { root, main } = await fixture()
  await writePin(root, pin(main))
  const lock = JSON.parse(await Deno.readTextFile(lockPath(root))) as {
    nodes: { systemfsoftware: { locked: Record<string, unknown> } }
  }
  delete lock.nodes.systemfsoftware.locked['rev']
  await Deno.writeTextFile(lockPath(root), `${JSON.stringify(lock, null, 2)}\n`)
  const ran = await checkPin(root)
  assertEquals(ran.code, 1)
  assertStringIncludes(ran.stderr, 'flake.lock')
  assertStringIncludes(ran.stderr, '`locked.rev`')
})

Deno.test('Should_BeUndecided_When_GitCannotStart', async () => {
  const { root, main } = await fixture()
  await writePin(root, pin(main))
  const withoutGit = join(dirname(root), 'path-without-git')
  await Deno.mkdir(withoutGit, { recursive: true })
  await Deno.writeTextFile(join(withoutGit, 'git'), '')
  const ran = await checkPin(root, { ...Deno.env.toObject(), PATH: withoutGit })
  assertEquals(ran.code, 2)
  assertStringIncludes(ran.stderr, 'undecided')
  assertStringIncludes(ran.stderr, 'git could not start')
})

/** A PATH whose `git` exits 128 when its arguments include `subcommand`, and is the real git otherwise. */
const pathWithFailingGit = async (root: string, subcommand: string): Promise<Record<string, string>> => {
  const real = (await run(root, 'sh', ['-c', 'command -v git'])).stdout.trim()
  const dir = join(dirname(root), `git-failing-${subcommand}`)
  await Deno.mkdir(dir, { recursive: true })
  const shim = join(dir, 'git')
  await Deno.writeTextFile(
    shim,
    `#!/bin/sh\nfor a in "$@"; do [ "$a" = ${subcommand} ] && exit 128; done\nexec ${real} "$@"\n`,
  )
  await Deno.chmod(shim, 0o755)
  return { ...Deno.env.toObject(), PATH: `${dir}:${Deno.env.get('PATH') ?? ''}` }
}

Deno.test('Should_BeUndecided_When_GitCannotTellWhetherThePinExists', async () => {
  const { root, main } = await fixture()
  await writePin(root, pin(main))
  const ran = await checkPin(root, await pathWithFailingGit(root, 'cat-file'))
  assertEquals(ran.code, 2)
  assertStringIncludes(ran.stderr, `git cat-file -e ${main} failed (exit 128)`)
})

Deno.test('Should_BeUndecided_When_GitCannotTellWhetherThePinIsOnMain', async () => {
  const { root, main } = await fixture()
  await writePin(root, pin(main))
  const ran = await checkPin(root, await pathWithFailingGit(root, 'merge-base'))
  assertEquals(ran.code, 2)
  assertStringIncludes(ran.stderr, `git merge-base --is-ancestor ${main} FETCH_HEAD failed (exit 128)`)
})

Deno.test('Should_NameTheFlake_When_TheFileIsAbsent', async () => {
  const { root, main } = await fixture()
  await writePin(root, pin(main))
  await Deno.remove(flakePath(root))
  const ran = await checkPin(root)
  assertEquals(ran.code, 1)
  assertStringIncludes(ran.stderr, 'templates/consumer/flake.nix: missing')
})

Deno.test('Should_NameTheCaller_When_ItsJobHasNoRefAndADecoyUsesLine', async () => {
  const { root, main } = await fixture()
  await writePin(root, pin(main))
  const withoutJobRef = callerYaml('checks', main, '# main').replace(/^ {4}uses: .*\n/m, '')
  await Deno.writeTextFile(callerPath(root, 'checks'), withBlockScalarDecoy('checks', withoutJobRef, main))
  const ran = await checkPin(root)
  assertEquals(ran.code, 1)
  assertStringIncludes(ran.stderr, '.github/workflows/checks.yml: its job has no `uses:` ref')
})

Deno.test('Should_NameTheCaller_When_ItCallsAnotherRepositorysWorkflowAtAMainCommit', async () => {
  const { root, main } = await fixture()
  await writePin(root, pin(main))
  const caller = callerPath(root, 'checks')
  await Deno.writeTextFile(
    caller,
    (await Deno.readTextFile(caller)).replace('systemfsoftware/systemfsoftware/', 'attacker/systemfsoftware/'),
  )
  const ran = await checkPin(root)
  assertEquals(ran.code, 1)
  assertStringIncludes(ran.stderr, `checks.yml: its \`uses:\` ref attacker/systemfsoftware/`)
  assertStringIncludes(ran.stderr, 'is not a systemfsoftware/systemfsoftware/.github/workflows/reusable-* workflow')
})

Deno.test('Should_NameThePacksConfig_When_ItsSourceIsAnotherRepository', async () => {
  const { root, main } = await fixture()
  await writePin(root, pin(main))
  await Deno.writeTextFile(
    packsPath(root),
    packsYaml(main).replace('github.com/systemfsoftware/systemfsoftware', 'github.com/attacker/systemfsoftware'),
  )
  const ran = await checkPin(root)
  assertEquals(ran.code, 1)
  assertStringIncludes(
    ran.stderr,
    'the pack `source` is https://github.com/attacker/systemfsoftware, not https://github.com/systemfsoftware/systemfsoftware',
  )
})

Deno.test('Should_NameTheLock_When_ItsSystemfsoftwareNodeIsLockedToAnotherRepository', async () => {
  const { root, main } = await fixture()
  await writePin(root, pin(main))
  const lock = JSON.parse(await Deno.readTextFile(lockPath(root))) as {
    nodes: { systemfsoftware: { locked: Record<string, unknown> } }
  }
  lock.nodes.systemfsoftware.locked['owner'] = 'attacker'
  await Deno.writeTextFile(lockPath(root), `${JSON.stringify(lock, null, 2)}\n`)
  const ran = await checkPin(root)
  assertEquals(ran.code, 1)
  assertStringIncludes(
    ran.stderr,
    'locked to github:attacker/systemfsoftware, not github:systemfsoftware/systemfsoftware',
  )
})
