// template-pin reads the six pin sites and requires one SHA reachable from
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

interface Ran {
  readonly code: number
  readonly stdout: string
  readonly stderr: string
}

const decoder = new TextDecoder()

const run = async (cwd: string, command: string, args: readonly string[]): Promise<Ran> => {
  const out = await new Deno.Command(command, { args: [...args], cwd, stdout: 'piped', stderr: 'piped' }).output()
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

const callerYaml = (stem: Stem, sha: string, comment: string | null): string =>
  `name: ${stem}

on:
  push:
    branches: [main]

jobs:
  ${stem}:
    name: ${stem}
    permissions:
      contents: read
    uses: systemfsoftware/systemfsoftware/.github/workflows/reusable-${stem}.yml@${sha}${
    comment === null ? '' : ` ${comment}`
  }
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
  const dir = join(root, 'templates', 'consumer', '.github', 'workflows')
  await Deno.mkdir(dir, { recursive: true })
  for (const stem of STEMS) {
    const comment = Object.hasOwn(comments, stem) ? comments[stem]! : '# main'
    await Deno.writeTextFile(join(dir, `${stem}.yml`), callerYaml(stem, shas[stem], comment))
  }
  const packs = join(root, 'templates', 'consumer', '.compound-engineering')
  await Deno.mkdir(packs, { recursive: true })
  await Deno.writeTextFile(join(packs, 'config.yaml'), packsYaml(shas.packs))
  await Deno.writeTextFile(join(root, 'templates', 'consumer', 'flake.lock'), lockJson(shas.lock))
}

const checkPin = (root: string): Promise<Ran> =>
  run(root, 'deno', [
    'run',
    `--config=${CONFIG}`,
    '--allow-read',
    '--allow-env',
    '--allow-run=git',
    CLI,
    'template-pin',
  ])

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
