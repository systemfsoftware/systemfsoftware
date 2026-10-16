import { assertEquals, assertThrows } from '@std/assert'
import { dirname, fromFileUrl, join } from '@std/path'
import { catalogsOf, judgePackedManifests, type Release, releasedBy, resolveCatalogs } from './packed-manifest.ts'
import { Undecided } from './verdict.ts'

const CATALOGS = catalogsOf({ catalog: { vitest: '^5.0.1' }, catalogs: { peers: { effect: '^4' } } })

Deno.test('Should_ResolveDefaultAndNamedCatalogs_When_AManifestNamesThem', () => {
  const manifest = {
    name: 'p',
    peerDependencies: { vitest: 'catalog:', effect: 'catalog:peers' },
    devDependencies: { vitest: 'catalog:default', other: 'workspace:^' },
  }
  assertEquals(resolveCatalogs(manifest, CATALOGS, 'p'), {
    name: 'p',
    peerDependencies: { vitest: '^5.0.1', effect: '^4' },
    devDependencies: { vitest: '^5.0.1', other: 'workspace:^' },
  })
})

Deno.test('Should_BeUndecided_When_ASpecifierNamesAMissingCatalogEntry', () => {
  assertThrows(() => resolveCatalogs({ dependencies: { chai: 'catalog:' } }, CATALOGS, 'p'), Undecided)
})

Deno.test('Should_CountOnlyBumpsAboveNone_When_ReadingAnIntent', () => {
  const intent = '---\n"@s/a": patch\n\'@s/b\': minor\n"@s/c": none\n@s/d: major\n---\n\nBody: "@s/e": patch\n'
  assertEquals(releasedBy(intent), ['@s/a', '@s/b', '@s/d'])
})

const release = (name: string, version: string, vitest: string): Release => ({
  name,
  version,
  packed: { name, version, devDependencies: { vitest } },
})
const map = (...releases: Release[]) => new Map(releases.map((r) => [r.name, r]))

Deno.test('Should_FlagAPackage_When_ItsResolvedManifestMovesUnderAnUnchangedVersion', () => {
  assertEquals(
    judgePackedManifests(map(release('a', '1.0.0', '^5')), map(release('a', '1.0.0', '^5.0.1')), new Set()),
    [
      'a@1.0.0: devDependencies.vitest ^5 -> ^5.0.1',
    ],
  )
})

Deno.test('Should_PassAPackage_When_APendingIntentReleasesIt', () => {
  assertEquals(
    judgePackedManifests(map(release('a', '1.0.0', '^5')), map(release('a', '1.0.0', '^5.0.1')), new Set(['a'])),
    [],
  )
})

Deno.test('Should_PassAPackage_When_ItsVersionMovesWithTheManifest', () => {
  assertEquals(
    judgePackedManifests(map(release('a', '1.0.0', '^5')), map(release('a', '1.0.1', '^5.0.1')), new Set()),
    [],
  )
})

Deno.test('Should_PassAPackage_When_ItIsNewAtHead', () => {
  assertEquals(judgePackedManifests(map(), map(release('a', '1.0.0', '^5.0.1')), new Set()), [])
})

// The CLI against a real repository: the catalog flip #726 shipped, where no file inside the package changed.
const CLI = join(dirname(fromFileUrl(import.meta.url)), 'cli.ts')
const CONFIG = join(dirname(fromFileUrl(import.meta.url)), '..', '..', 'deno.jsonc')

const sh = async (cwd: string, cmd: string, args: string[]): Promise<number> =>
  (await new Deno.Command(cmd, { args, cwd, stdout: 'null', stderr: 'null' }).output()).code

const repo = async (): Promise<{ dir: string; commit: (message: string) => Promise<void> }> => {
  const dir = await Deno.makeTempDir()
  await sh(dir, 'git', ['init', '-q', '-b', 'main'])
  const commit = async (message: string) => {
    await sh(dir, 'git', ['add', '-A'])
    await sh(dir, 'git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--no-verify', '-m', message])
  }
  await Deno.mkdir(join(dir, 'packages/a'), { recursive: true })
  await Deno.mkdir(join(dir, '.changeset'))
  await Deno.writeTextFile(join(dir, '.changeset/README.md'), '---\n"@s/a": major\n---\n')
  await Deno.writeTextFile(join(dir, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\ncatalog:\n  vitest: ^5\n')
  await Deno.writeTextFile(
    join(dir, 'packages/a/package.json'),
    JSON.stringify({ name: '@s/a', version: '1.0.0', peerDependencies: { vitest: 'catalog:' } }),
  )
  await commit('base')
  await Deno.writeTextFile(join(dir, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\ncatalog:\n  vitest: ^5.0.1\n')
  return { dir, commit }
}

const check = (dir: string): Promise<number> =>
  sh(dir, 'deno', [
    'run',
    `--config=${CONFIG}`,
    '--allow-read',
    '--allow-env',
    '--allow-run=git',
    CLI,
    'packed-manifest',
    '--base',
    'main~1',
    '--head',
    'HEAD',
  ])

Deno.test('Should_ExitOne_When_ACatalogFlipShipsWithNoIntent', async () => {
  const { dir, commit } = await repo()
  await commit('flip')
  assertEquals(await check(dir), 1)
})

Deno.test('Should_ExitOne_When_TheOnlyIntentForTheFlipIsNone', async () => {
  const { dir, commit } = await repo()
  await Deno.writeTextFile(join(dir, '.changeset/x.md'), '---\n"@s/a": none\n---\n\nNothing.\n')
  await commit('flip')
  assertEquals(await check(dir), 1)
})

Deno.test('Should_ExitZero_When_APendingIntentReleasesTheFlippedPackage', async () => {
  const { dir, commit } = await repo()
  await Deno.writeTextFile(join(dir, '.changeset/x.md'), '---\n"@s/a": patch\n---\n\nRange.\n')
  await commit('flip')
  assertEquals(await check(dir), 0)
})
