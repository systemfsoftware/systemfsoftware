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
          root: { inputs: { systemfsoftware: 'systemfsoftware' } },
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
          },
        },
        root: 'root',
        version: 7,
      },
      null,
      2,
    )
  }\n`

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

Deno.test('Should_NameThePacksConfig_When_ItsEntryHasNoRef', async () => {
  const { root, main } = await fixture()
  await writePin(root, pin(main))
  await Deno.writeTextFile(
    packsPath(root),
    'packs:\n  - source: https://github.com/systemfsoftware/systemfsoftware\n    path: compound-packs\n',
  )
  const ran = await checkPin(root)
  assertEquals(ran.code, 1)
  assertStringIncludes(ran.stderr, '.compound-engineering/config.yaml')
  assertStringIncludes(ran.stderr, '`ref`')
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

Deno.test('Should_BeUndecided_When_TheAncestryProbeOutlivesTheDeadline', async () => {
  const { root, main } = await fixture()
  await writePin(root, pin(main))
  const realGit = (await run(root, 'sh', ['-c', 'command -v git'])).stdout.trim()
  const stalling = join(dirname(root), 'path-with-stalling-merge-base')
  await Deno.mkdir(stalling, { recursive: true })
  await Deno.writeTextFile(
    join(stalling, 'git'),
    `#!/bin/sh\nif [ "$1" = merge-base ]; then exec sleep 600; fi\nexec ${realGit} "$@"\n`,
    { mode: 0o755 },
  )
  const ran = await checkPin(root, { ...Deno.env.toObject(), PATH: `${stalling}:${Deno.env.get('PATH') ?? ''}` })
  assertEquals(ran.code, 2)
  assertStringIncludes(ran.stderr, 'undecided')
  assertStringIncludes(ran.stderr, 'killed after 60s')
})
