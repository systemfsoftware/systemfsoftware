// The CLI cases drive the real check against temporary workspaces; the source
// cases judge one config's text. Either way the configs are shapes a package
// could commit, and the expected codes come from the rule (spread
// sharedConfig, declare no ignorePatterns), not from the check's output.
import { assertEquals, assertStringIncludes } from '@std/assert'
import { dirname, fromFileUrl, join } from '@std/path'
import { judgeConfig } from './mutation-config.ts'

const CLI = fromFileUrl(new URL('./cli.ts', import.meta.url))
const CONFIG = fromFileUrl(new URL('../../../scripts/deno.jsonc', import.meta.url))
const LOCK = fromFileUrl(new URL('../../../scripts/deno.lock', import.meta.url))
const decoder = new TextDecoder()

const SHARED_ONLY = `import { sharedConfig } from '@systemfsoftware/stryker-config'
// ignorePatterns come from sharedConfig: no list of our own.
const config = defineConfig({ ...sharedConfig, mutate: ['src/**/*.workflow.ts'], disableBail: false })
export default config
`
const configWith = (extra: string): string =>
  `import { sharedConfig } from '@systemfsoftware/stryker-config'
const config = defineConfig({
  ...sharedConfig,
  mutate: ['src/**/*.workflow.ts'],
  ${extra}
})
export default config
`

Deno.test('Should_RefuseAnOwnList_When_AGlobStringHoldsSlashStarAndAnotherHoldsStarSlash', () => {
  const source = `const config = defineConfig({
  ...sharedConfig,
  mutate: ['src/*.workflow.ts'],
  ignorePatterns: [],
  testRunner: 'vitest', vitest: { dir: 'src/**/' },
})`
  assertEquals(judgeConfig(source), ['MUTATION_CONFIG_OWN_IGNORE'])
})

Deno.test('Should_RefuseAnOwnList_When_AStringHoldsADoubleSlash', () => {
  assertEquals(judgeConfig(configWith("homepage: 'https://example.com', ignorePatterns: [],")), [
    'MUTATION_CONFIG_OWN_IGNORE',
  ])
})

Deno.test('Should_Hold_When_IgnorePatternsAppearsOnlyInComments', () => {
  assertEquals(judgeConfig(configWith('/* ignorePatterns: [] */ // ignorePatterns: []')), [])
})

Deno.test('Should_ReportBothCodes_When_AConfigSkipsTheSpreadAndNamesItsOwnList', () => {
  assertEquals(judgeConfig("export default { mutate: ['src/*.ts'], ignorePatterns: ['coverage'] }"), [
    'MUTATION_CONFIG_NO_SHARED',
    'MUTATION_CONFIG_OWN_IGNORE',
  ])
})

const write = async (cwd: string, path: string, content: string): Promise<void> => {
  await Deno.mkdir(join(cwd, dirname(path)), { recursive: true })
  await Deno.writeTextFile(join(cwd, path), content)
}

const mutated = async (cwd: string, dir: string, config: string | null): Promise<void> => {
  await write(cwd, `${dir}/package.json`, JSON.stringify({ name: dir, scripts: { mutation: 'stryker run' } }))
  if (config !== null) await write(cwd, `${dir}/stryker.config.ts`, config)
}

const runCheck = async (
  build: (cwd: string) => Promise<void>,
): Promise<{ readonly code: number; readonly stdout: string; readonly stderr: string }> => {
  const cwd = await Deno.makeTempDir({ prefix: 'mutation-config-test-' })
  try {
    await write(cwd, 'pnpm-workspace.yaml', 'packages:\n  - "packages/*"\n')
    await build(cwd)
    const out = await new Deno.Command(Deno.execPath(), {
      cwd,
      args: [
        'run',
        '--config',
        CONFIG,
        '--lock',
        LOCK,
        '--frozen',
        '--allow-read',
        '--allow-env',
        CLI,
        'mutation-config',
      ],
      stdout: 'piped',
      stderr: 'piped',
    }).output()
    return { code: out.code, stdout: decoder.decode(out.stdout), stderr: decoder.decode(out.stderr) }
  } finally {
    await Deno.remove(cwd, { recursive: true })
  }
}

const violations = (stderr: string): string[] =>
  stderr.split('\n').filter((line) => line.startsWith('  ')).map((line) => line.trim()).sort()

Deno.test('Should_Hold_When_EveryMutatedConfigSpreadsSharedConfigAndSetsNoIgnoreList', async () => {
  const out = await runCheck(async (cwd) => {
    await mutated(cwd, 'packages/a', SHARED_ONLY)
    await write(cwd, 'packages/b/package.json', JSON.stringify({ name: 'b', scripts: { test: 'vitest' } }))
    await write(cwd, 'packages/b/stryker.config.ts', configWith('ignorePatterns: [],'))
  })
  assertEquals([out.code, out.stdout.trim()], [
    0,
    "repo-checks mutation-config: holds - 1 mutated package config(s) keep sharedConfig's ignorePatterns",
  ])
})

Deno.test('Should_Refuse_When_AConfigReAddsAnEmptyIgnoreList', async () => {
  const out = await runCheck(async (cwd) => {
    await mutated(cwd, 'packages/a', SHARED_ONLY)
    await mutated(cwd, 'packages/b', configWith('ignorePatterns: [],'))
  })
  assertEquals([out.code, violations(out.stderr)], [1, ['MUTATION_CONFIG_OWN_IGNORE packages/b/stryker.config.ts']])
})

Deno.test('Should_Refuse_When_AConfigSetsANarrowerIgnoreListAfterTheSpread', async () => {
  const out = await runCheck((cwd) => mutated(cwd, 'packages/a', configWith("ignorePatterns: ['coverage'],")))
  assertEquals([out.code, violations(out.stderr)], [1, ['MUTATION_CONFIG_OWN_IGNORE packages/a/stryker.config.ts']])
})

Deno.test('Should_Refuse_When_AConfigDoesNotSpreadSharedConfig', async () => {
  const out = await runCheck((cwd) =>
    mutated(cwd, 'packages/a', "export default { mutate: ['src/**/*.workflow.ts'], incremental: true }\n")
  )
  assertEquals([out.code, violations(out.stderr)], [1, ['MUTATION_CONFIG_NO_SHARED packages/a/stryker.config.ts']])
})

Deno.test('Should_BeUndecided_When_AMutatedPackageHasNoStrykerConfig', async () => {
  const out = await runCheck((cwd) => mutated(cwd, 'packages/a', null))
  assertEquals(out.code, 2)
  assertStringIncludes(out.stderr, 'packages/a: has a `mutation` script and 0 stryker config files')
})
