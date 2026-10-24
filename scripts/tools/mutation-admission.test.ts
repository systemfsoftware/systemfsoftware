import { assertEquals, assertStringIncludes } from '@std/assert'
import { dirname, fromFileUrl, join } from '@std/path'
import { Result } from 'effect'
import { admitMutation, annotationOf, type ProbeFacts, probeFactsOf, sweptFilesOf } from './mutation-admission.ts'

const here = dirname(fromFileUrl(import.meta.url))

/** Runs `mutation-admit.ts` in `cwd` with only `extra` and the file-command paths in its environment, besides PATH. */
const admit = (cwd: string, extra: Readonly<Record<string, string>> = {}) =>
  new Deno.Command(Deno.execPath(), {
    args: [
      'run',
      `--config=${join(here, '..', 'deno.jsonc')}`,
      `--lock=${join(here, '..', 'deno.lock')}`,
      '--frozen',
      '--allow-read',
      '--allow-write',
      '--allow-env',
      '--allow-run=pnpm',
      join(here, 'mutation-admit.ts'),
    ],
    cwd,
    clearEnv: true,
    env: {
      PATH: Deno.env.get('PATH') ?? '',
      HOME: Deno.env.get('HOME') ?? '',
      GITHUB_OUTPUT: join(cwd, 'github-output'),
      GITHUB_STEP_SUMMARY: join(cwd, 'github-step-summary'),
      ...extra,
    },
    stdout: 'piped',
    stderr: 'piped',
  }).output()

const write = async (path: string, text: string): Promise<void> => {
  await Deno.mkdir(dirname(path), { recursive: true })
  await Deno.writeTextFile(path, text)
}

const readOrEmpty = async (path: string): Promise<string> => {
  try {
    return await Deno.readTextFile(path)
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return ''
    throw error
  }
}

const strykerConfigPackage = join(here, '..', '..', 'packages', 'toolchain', 'stryker-config')

const INHERITED_CONFIG = [
  "import { sharedConfig } from '@systemfsoftware/stryker-config'",
  'export default { ...sharedConfig }',
  '',
].join('\n')

type MutationPackage = {
  readonly scripts?: Readonly<Record<string, string>>
  readonly files: Readonly<Record<string, string>>
}

/** A workspace whose packages each link the real `@systemfsoftware/stryker-config`, as an install would. */
const mutationWorkspace = async (pkgs: Readonly<Record<string, MutationPackage>>): Promise<string> => {
  const root = await Deno.makeTempDir({ prefix: 'mutation-workspace-' })
  await write(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - p/*\n')
  await write(join(root, 'package.json'), JSON.stringify({ name: 'root', private: true }))
  for (const [name, pkg] of Object.entries(pkgs)) {
    const dir = join(root, 'p', name.replace(/^@x\//, ''))
    const scripts = pkg.scripts ?? { mutation: 'stryker run' }
    await write(join(dir, 'package.json'), JSON.stringify({ name, type: 'module', scripts }))
    await Deno.mkdir(join(dir, 'node_modules', '@systemfsoftware'), { recursive: true })
    await Deno.symlink(strykerConfigPackage, join(dir, 'node_modules', '@systemfsoftware', 'stryker-config'))
    for (const [file, text] of Object.entries(pkg.files)) await write(join(dir, file), text)
  }
  return root
}

const WORKFLOW = 'export const decide = (n: number) => (n > 0 ? 1 : 0)\n'

/** A package whose config mutates all of `src/` when `condition` holds, and inherits the shared set otherwise. */
const gatedOn = (condition: string): Record<string, string> => ({
  'src/decide.workflow.ts': WORKFLOW,
  'src/helper.ts': 'export const helper = 1\n',
  'stryker.config.ts': [
    "import { sharedConfig } from '@systemfsoftware/stryker-config'",
    `export default { ...sharedConfig, mutate: ${condition} ? ['src/**/*.ts'] : sharedConfig.mutate }`,
    '',
  ].join('\n'),
})

Deno.test('admission refuses, before any Stryker run, every package that widens or replaces the shared mutated set', async () => {
  const root = await mutationWorkspace({
    '@x/clean': { files: { 'src/decide.workflow.ts': WORKFLOW, 'stryker.config.ts': INHERITED_CONFIG } },
    // Stryker's matcher reaches a hidden path that Node's glob, and so the shared set, skips.
    '@x/hidden': {
      files: {
        'src/decide.workflow.ts': WORKFLOW,
        'src/.generated/__tests__/extra.workflow.ts': WORKFLOW,
        'stryker.config.ts': INHERITED_CONFIG,
      },
    },
    // A file named `.workflow.ts` is hidden too; Stryker's matcher takes it, so the plan refuses it.
    '@x/hidden-bare': {
      files: {
        'src/decide.workflow.ts': WORKFLOW,
        'src/.workflow.ts': WORKFLOW,
        'stryker.config.ts': INHERITED_CONFIG,
      },
    },
    // Stryker never crawls `.turbo`, and a directory is not a file: neither is refused.
    '@x/hidden-ignored': {
      files: {
        'src/decide.workflow.ts': WORKFLOW,
        'src/.turbo/cache.workflow.ts': WORKFLOW,
        'src/.gen.workflow.ts/keep': '',
        'stryker.config.ts': INHERITED_CONFIG,
      },
    },
    // Stryker's crawl drops a file before mutate selects it: an added ignore pattern, or a shared one naming a
    // directory on the file's path, hides a workflow file; `since` keeps only changed lines.
    '@x/ignore-extra': {
      files: {
        'src/decide.workflow.ts': WORKFLOW,
        'stryker.config.ts': [
          "import { sharedConfig } from '@systemfsoftware/stryker-config'",
          "export default { ...sharedConfig, ignorePatterns: [...sharedConfig.ignorePatterns, 'src/decide.workflow.ts'] }",
          '',
        ].join('\n'),
      },
    },
    '@x/reports-dir': {
      files: {
        'src/decide.workflow.ts': WORKFLOW,
        'src/Reports/summary.workflow.ts': WORKFLOW,
        'stryker.config.ts': INHERITED_CONFIG,
      },
    },
    // With no ignore pattern of its own kept, a shared-named directory hides nothing, so this package is admitted.
    '@x/reports-unignored': {
      files: {
        'src/reports/summary.workflow.ts': WORKFLOW,
        'stryker.config.ts': [
          "import { sharedConfig } from '@systemfsoftware/stryker-config'",
          'export default { ...sharedConfig, ignorePatterns: [] }',
          '',
        ].join('\n'),
      },
    },
    // An ignore pattern pushed onto the shared array is the config's own, though the array is the shared one.
    '@x/ignore-pushed': {
      files: {
        'src/decide.workflow.ts': WORKFLOW,
        'stryker.config.ts': [
          "import { sharedConfig } from '@systemfsoftware/stryker-config'",
          "sharedConfig.ignorePatterns.push('src/**')",
          'export default { ...sharedConfig }',
          '',
        ].join('\n'),
      },
    },
    // Hidden files under directories Stryker's crawl drops, in any case, are mutated by neither set, so no refusal.
    '@x/hidden-dropped': {
      files: {
        'src/decide.workflow.ts': WORKFLOW,
        'src/.GIT/cached.workflow.ts': WORKFLOW,
        'src/Reports/.snapshots/kept.workflow.ts': WORKFLOW,
        'src/.cache/out.TSBuildInfo/stale.workflow.ts': WORKFLOW,
        'src/.stryker-tmp/sandbox-1/copied.workflow.ts': WORKFLOW,
        'stryker.config.ts': INHERITED_CONFIG,
      },
    },
    // A config that clears the shared ignore patterns lets Stryker crawl `reports`, so a hidden file there is mutated.
    '@x/hidden-unignored': {
      files: {
        'src/decide.workflow.ts': WORKFLOW,
        'src/reports/.snapshots/kept.workflow.ts': WORKFLOW,
        'stryker.config.ts': [
          "import { sharedConfig } from '@systemfsoftware/stryker-config'",
          'export default { ...sharedConfig, ignorePatterns: [] }',
          '',
        ].join('\n'),
      },
    },
    // Stryker's crawl always drops a directory named `*.tsbuildinfo`, which Node's glob still lists.
    '@x/tsbuildinfo-dir': {
      files: {
        'src/decide.workflow.ts': WORKFLOW,
        'src/Cache.TSBuildInfo/stale.workflow.ts': WORKFLOW,
        'stryker.config.ts': INHERITED_CONFIG,
      },
    },
    '@x/node-modules-dir': {
      files: {
        'src/decide.workflow.ts': WORKFLOW,
        'src/node_modules/vendored.workflow.ts': WORKFLOW,
        'stryker.config.ts': INHERITED_CONFIG,
      },
    },
    // Moving the temp directory would let Stryker crawl `.stryker-tmp`, which the sweep drops for every package.
    '@x/temp-moved': {
      files: {
        'src/decide.workflow.ts': WORKFLOW,
        'stryker.config.ts': [
          "import { sharedConfig } from '@systemfsoftware/stryker-config'",
          "export default { ...sharedConfig, tempDirName: 'sandbox' }",
          '',
        ].join('\n'),
      },
    },
    // Stryker's crawl ignores every output path, so a report written over a workflow file hides it.
    '@x/output-over': {
      files: {
        'src/decide.workflow.ts': WORKFLOW,
        'stryker.config.ts': [
          "import { sharedConfig } from '@systemfsoftware/stryker-config'",
          "export default { ...sharedConfig, jsonReporter: { fileName: 'src/decide.workflow.ts' } }",
          '',
        ].join('\n'),
      },
    },
    '@x/since': {
      files: {
        'src/decide.workflow.ts': WORKFLOW,
        'stryker.config.ts': [
          "import { sharedConfig } from '@systemfsoftware/stryker-config'",
          "export default { ...sharedConfig, since: 'main' }",
          '',
        ].join('\n'),
      },
    },
    // A negation pushed onto the shared array is Stryker's glob, not a file name: it hides every workflow file.
    '@x/glob-negated': {
      files: {
        'src/decide.workflow.ts': WORKFLOW,
        'stryker.config.ts': [
          "import { sharedConfig } from '@systemfsoftware/stryker-config'",
          "sharedConfig.mutate.push('!src/**/*.workflow.ts')",
          'export default { ...sharedConfig }',
          '',
        ].join('\n'),
      },
    },
    '@x/own': {
      files: {
        'src/decide.workflow.ts': WORKFLOW,
        'src/shape.schema.ts': 'export const shape = 1\n',
        'src/__tests__/decide.test.ts': 'export {}\n',
        'stryker.config.ts': [
          "import { sharedConfig } from '@systemfsoftware/stryker-config'",
          "export default { ...sharedConfig, mutate: ['src/**/*.ts'] }",
          '',
        ].join('\n'),
      },
    },
    '@x/script': {
      scripts: { mutation: 'stryker run --mutate src/decide.workflow.ts' },
      files: { 'src/decide.workflow.ts': WORKFLOW, 'stryker.config.ts': INHERITED_CONFIG },
    },
    '@x/full': {
      scripts: { mutation: 'stryker run', 'mutation:full': 'stryker run --force' },
      files: { 'src/decide.workflow.ts': WORKFLOW, 'stryker.config.ts': INHERITED_CONFIG },
    },
    '@x/fullonly': {
      scripts: { 'mutation:full': 'stryker run --force' },
      files: { 'src/decide.workflow.ts': WORKFLOW, 'stryker.config.ts': INHERITED_CONFIG },
    },
    '@x/ci-gated': { files: gatedOn("process.env['CI']") },
    '@x/output-gated': { files: gatedOn("process.env['GITHUB_OUTPUT'] !== undefined") },
    // A workflow file under a fixture or mock directory is a test file: the shared set leaves it out, so no refusal.
    '@x/test-dir-workflow': {
      files: {
        'src/decide.workflow.ts': WORKFLOW,
        'src/__fixtures__/sample.workflow.ts': WORKFLOW,
        'src/__mocks__/stub.workflow.ts': WORKFLOW,
        'stryker.config.ts': INHERITED_CONFIG,
      },
    },
    '@x/bare': { files: { 'src/decide.ts': WORKFLOW, 'stryker.config.ts': INHERITED_CONFIG } },
    '@x/broken': {
      files: { 'src/decide.workflow.ts': WORKFLOW, 'stryker.config.ts': "throw new Error('no config today')\n" },
    },
    '@x/shadow': {
      files: {
        'src/decide.workflow.ts': WORKFLOW,
        'src/helper.ts': 'export const helper = 1\n',
        'stryker.config.ts': INHERITED_CONFIG,
        'stryker.conf.ts': [
          "import { sharedConfig } from '@systemfsoftware/stryker-config'",
          "export default { ...sharedConfig, mutate: ['src/**/*.workflow.ts', 'src/helper.ts'] }",
          '',
        ].join('\n'),
      },
    },
    '@x/pushed': {
      files: {
        'src/decide.workflow.ts': WORKFLOW,
        'src/helper.ts': 'export const helper = 1\n',
        'stryker.config.ts': [
          "import { sharedConfig } from '@systemfsoftware/stryker-config'",
          "sharedConfig.mutate.push('src/helper.ts')",
          'export default { ...sharedConfig }',
          '',
        ].join('\n'),
      },
    },
    '@x/unenrolled': { scripts: {}, files: { 'src/decide.workflow.ts': WORKFLOW } },
    '@x/unenrolled-tests': { scripts: {}, files: { 'src/__tests__/decide.workflow.ts': WORKFLOW } },
    // An unenrolled member's config is never loaded, and once enrolled it may clear `reports`, so it is refused.
    '@x/unenrolled-reports': { scripts: {}, files: { 'src/reports/.snapshots/kept.workflow.ts': WORKFLOW } },
    // The shared set is what Node's glob gives the probe: it follows a symlink; a hidden path is refused on its own.
    '@x/unenrolled-linked': { scripts: {}, files: { 'lib/decide.ts': WORKFLOW } },
    '@x/unenrolled-dotted': { scripts: {}, files: { 'src/.generated/decide.workflow.ts': WORKFLOW } },
  })
  await Deno.mkdir(join(root, 'p', 'unenrolled-linked', 'src'))
  await Deno.symlink('../lib/decide.ts', join(root, 'p', 'unenrolled-linked', 'src', 'decide.workflow.ts'))
  // A workspace member with no package name can never be enrolled, so the plan names it by its directory.
  await write(join(root, 'p', 'nameless', 'package.json'), JSON.stringify({ private: true }))
  await write(join(root, 'p', 'nameless', 'src', 'decide.workflow.ts'), WORKFLOW)
  try {
    // The plan job has CI set and the file-command paths: admission judges each config there.
    const out = await admit(root, { CI: 'true' })
    const stderr = new TextDecoder().decode(out.stdout)
    assertEquals(out.code === 0, false, stderr)
    const refused = stderr.split('\n').filter((line) => line.startsWith('::error title='))
      .map((line) => /^::error title=([a-z-]+)::(\S+?):/.exec(line)?.slice(1, 3).join(' ') ?? line).sort()
    assertEquals(refused, [
      'config-unloadable @x/broken',
      'hidden-workflow-file @x/hidden',
      'hidden-workflow-file @x/hidden-bare',
      'hidden-workflow-file @x/hidden-unignored',
      'hidden-workflow-file @x/unenrolled-dotted',
      'hidden-workflow-file @x/unenrolled-reports',
      'ignored-workflow-file @x/node-modules-dir',
      'ignored-workflow-file @x/reports-dir',
      'ignored-workflow-file @x/tsbuildinfo-dir',
      'missing-mutation-script @x/unenrolled',
      'missing-mutation-script @x/unenrolled-linked',
      'missing-mutation-script p/nameless',
      'mutation-script @x/full',
      'mutation-script @x/fullonly',
      'mutation-script @x/script',
      'no-workflow-file @x/bare',
      'non-workflow-target @x/ci-gated',
      'non-workflow-target @x/output-gated',
      'non-workflow-target @x/own',
      'non-workflow-target @x/pushed',
      'non-workflow-target @x/shadow',
      'own-ignore-patterns @x/ignore-extra',
      'own-ignore-patterns @x/ignore-pushed',
      'own-mutate-targets @x/ci-gated',
      'own-mutate-targets @x/glob-negated',
      'own-mutate-targets @x/output-gated',
      'own-mutate-targets @x/own',
      'own-mutate-targets @x/pushed',
      'own-mutate-targets @x/shadow',
      'own-output-paths @x/output-over',
      'own-output-paths @x/temp-moved',
      'scoped-mutation @x/since',
      'test-file-target @x/own',
    ])
    const unenrolled = stderr.split('\n').find((line) =>
      line.startsWith('::error title=missing-mutation-script::@x/unenrolled:')
    )
    assertStringIncludes(unenrolled ?? '', 'src/decide.workflow.ts')
    const own = stderr.split('\n').filter((line) => line.startsWith('::error title=') && line.includes('@x/own:'))
    assertStringIncludes(own.find((line) => line.includes('non-workflow-target')) ?? '', 'src/shape.schema.ts')
    assertStringIncludes(own.find((line) => line.includes('test-file-target')) ?? '', 'src/__tests__/decide.test.ts')
    const shadow = stderr.split('\n').find((line) => line.startsWith('::error title=') && line.includes('@x/shadow:'))
    assertStringIncludes(shadow ?? '', 'stryker.conf.ts')
    assertEquals(await readOrEmpty(join(root, 'github-output')), '')
  } finally {
    await Deno.remove(root, { recursive: true })
  }
})

/** A loaded config's scope that selects nothing beyond `mutate`: the shared ignore patterns, no `since`, no outputs. */
const UNSCOPED = { ignorePatterns: [], sharedIgnorePatterns: [], since: null, outputs: [] }

Deno.test('probe facts that mix two states, or name none, refuse the package rather than read as one state', () => {
  const shared = { patterns: ['src/**/*.workflow.ts', '!src/**/__tests__/**'], files: ['src/d.workflow.ts'] }
  const loaded = {
    _tag: 'Loaded',
    config: 'stryker.config.ts',
    shared,
    mutate: { _tag: 'Inherited' },
    scope: UNSCOPED,
  }
  const refusedOf = (facts: unknown): string[] => {
    const probe = probeFactsOf(`pnpm noise\n${JSON.stringify(facts)}\n`, 'node: the probe stopped')
    return admitMutation([{
      name: '@x/p',
      dir: 'p/p',
      scripts: { mutation: 'stryker run' },
      probe,
    }], [])
      .map(annotationOf)
  }
  assertEquals(refusedOf(loaded), [])
  // A shared package that would not load leaves no shared set, so its error is the one refusal.
  assertEquals(refusedOf({ _tag: 'SharedFailed', error: "Cannot find package '@systemfsoftware/stryker-config'" }), [
    "::error title=config-unloadable::@x/p: Cannot find package '@systemfsoftware/stryker-config'",
  ])
  const unjudged = {
    'a loaded config that also failed': { ...loaded, error: 'no config' },
    'a failed config that still carries a mutate set': {
      _tag: 'ConfigFailed',
      shared,
      error: 'x',
      mutate: loaded.mutate,
    },
    'facts with no state': {
      config: 'stryker.config.ts',
      shared,
      own: null,
      error: null,
      scope: UNSCOPED,
    },
  }
  for (const [name, facts] of Object.entries(unjudged)) {
    const [refusal, ...rest] = refusedOf(facts)
    assertEquals(rest, [], name)
    assertStringIncludes(
      refusal ?? '',
      '::error title=config-unloadable::@x/p: the config probe printed no facts (',
      name,
    )
    assertStringIncludes(refusal ?? '', 'node: the probe stopped', name)
  }
})

Deno.test('a shared set holding a test file is refused once, apart from a config that mutates the same file', () => {
  // The shared set an installed stryker-config older than the planner gives: no __fixtures__ exclusion.
  const stale = {
    patterns: ['src/**/*.workflow.ts', '!src/**/__tests__/**'],
    files: ['src/d.workflow.ts', 'src/__fixtures__/f.workflow.ts'],
  }
  const probe = (mutate: Extract<ProbeFacts, { _tag: 'Loaded' }>['mutate']): ProbeFacts => ({
    _tag: 'Loaded',
    config: 'stryker.config.ts',
    shared: stale,
    mutate,
    scope: UNSCOPED,
  })
  const inherited = { _tag: 'Inherited' } as const
  const copied = { _tag: 'Own', patterns: stale.patterns, extends: null, files: stale.files } as const
  const annotations = admitMutation([
    {
      name: '@x/stale',
      dir: 'p/stale',
      scripts: { mutation: 'stryker run' },
      probe: probe(inherited),
    },
    {
      name: '@x/copied',
      dir: 'p/copied',
      scripts: { mutation: 'stryker run' },
      probe: probe(copied),
    },
  ], []).map(annotationOf)
  assertEquals(annotations.map((line) => /^::error title=([a-z-]+)::(\S+?):/.exec(line)?.slice(1, 3).join(' ')), [
    'shared-test-file @x/stale',
    'shared-test-file @x/copied',
    'own-mutate-targets @x/copied',
    'test-file-target @x/copied',
  ])
  assertStringIncludes(annotations[0] ?? '', 'holds test files src/__fixtures__/f.workflow.ts; upgrade it')
  assertEquals(annotations[3]?.endsWith('src/__fixtures__/f.workflow.ts'), true, annotations[3])
})

Deno.test('the sweep facts stop the plan when a directory is left out or the output is not facts', () => {
  const both = JSON.stringify({ 'p/a': { files: ['src/a.workflow.ts'], hidden: [] }, 'p/b': { files: [], hidden: [] } })
  assertEquals(
    Result.map(sweptFilesOf(`pnpm noise\n${both}\n`, ['p/a', 'p/b']), (facts) => facts.get('p/a')),
    Result.succeed({ files: ['src/a.workflow.ts'], hidden: [] }),
  )
  assertEquals(
    sweptFilesOf(JSON.stringify({ 'p/a': { files: [], hidden: [] } }), ['p/a', 'p/b']),
    Result.fail('the sweep printed no facts for p/b'),
  )
  for (const stdout of ['', 'not json', JSON.stringify({ 'p/a': { files: 'src/a.workflow.ts', hidden: [] } })]) {
    const swept = sweptFilesOf(stdout, ['p/a'])
    assertEquals(Result.isFailure(swept), true, stdout)
    assertStringIncludes(Result.getOrElse(Result.flip(swept), () => ''), 'the sweep printed no facts (')
  }
})
