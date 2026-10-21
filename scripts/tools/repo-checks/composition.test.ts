import { assert, assertEquals, assertStringIncludes } from '@std/assert'
import { dirname, join } from '@std/path'
import {
  checkCompositionContracts,
  checkCompositionEntries,
  checkCompositionGranularity,
  checkCompositionGraph,
  checkCompositionImports,
  checkCompositionUnitKinds,
  coChanged,
} from './composition.ts'
import type { Verdict } from './verdict.ts'

// Each test writes a small real workspace to a temp directory and runs the check on it.
const workspace = async (files: Readonly<Record<string, string | object>>): Promise<string> => {
  const root = await Deno.makeTempDir({ prefix: 'composition-' })
  const all = { 'pnpm-workspace.yaml': 'packages:\n  - packages/*\n  - apps/*\n', ...files }
  for (const [path, content] of Object.entries(all)) {
    await Deno.mkdir(dirname(join(root, path)), { recursive: true })
    await Deno.writeTextFile(join(root, path), typeof content === 'string' ? content : JSON.stringify(content, null, 2))
  }
  return root
}

const violations = (verdict: Verdict): readonly string[] => verdict._tag === 'Violated' ? verdict.violations : []

const lib = (name: string, extra: object = {}) => ({
  name,
  unit: 'library',
  private: true,
  exports: { '.': './src/index.ts' },
  ...extra,
})
const app = (name: string, extra: object = {}) => ({ name, unit: 'application', private: true, ...extra })

Deno.test('Should_Hold_When_EveryUnitDeclaresItsKindAndShape', async () => {
  const root = await workspace({
    'packages/a/package.json': lib('a'),
    'apps/web/package.json': app('web'),
    'packages/t/package.json': { name: 't', unit: 'template' },
  })
  assertEquals((await checkCompositionUnitKinds(root))._tag, 'Holds')
})

Deno.test('Should_Fail_When_UnitKindsAreMissingOrContradicted', async () => {
  const root = await workspace({
    'packages/none/package.json': { name: 'none' },
    'packages/odd/package.json': { name: 'odd', unit: 'service' },
    'apps/loud/package.json': app('loud', { exports: { '.': './x.ts' } }),
    'apps/public/package.json': { name: 'public', unit: 'application' },
    'packages/shipper/package.json': lib('shipper', { scripts: { deploy: 'wrangler deploy' } }),
  })
  const found = violations(await checkCompositionUnitKinds(root)).join('\n')
  for (
    const expected of [
      'none): no "unit" declared',
      '"service" is not library',
      'an application has no "exports"',
      'must be "private": true',
      'no deploy script',
    ]
  ) assertStringIncludes(found, expected)
})

Deno.test('Should_Hold_When_TheGraphPointsDownAndEveryEdgeIsDeclaredAndImported', async () => {
  const root = await workspace({
    'packages/low/package.json': lib('low', { layer: 'core' }),
    'packages/low/src/index.ts': 'export const low = 1\n',
    'packages/high/package.json': lib('high', { dependencies: { low: 'workspace:*' } }),
    'packages/high/src/index.ts': "import { low } from 'low'\nexport const high = low\n",
    'apps/web/package.json': app('web', { dependencies: { high: 'workspace:*' } }),
    'apps/web/src/main.ts': "import { high } from 'high'\nconsole.log(high)\n",
  })
  assertEquals((await checkCompositionGraph(root))._tag, 'Holds')
})

Deno.test('Should_Fail_When_TheGraphBreaksADirectionDeclarationCoreOrConfigRule', async () => {
  const root = await workspace({
    'apps/web/package.json': app('web'),
    'apps/web/src/main.ts': 'export const web = 1\n',
    'packages/a/package.json': lib('a', {
      dependencies: { web: 'workspace:*', unused: 'workspace:*', b: 'workspace:*' },
    }),
    'packages/a/src/index.ts': "import 'b'\nimport 'web'\nimport 'c'\n",
    'packages/b/package.json': lib('b', { dependencies: { a: 'workspace:*' } }),
    'packages/b/src/index.ts': "import 'a'\n",
    'packages/c/package.json': lib('c', { layer: 'core' }),
    'packages/c/src/index.ts':
      "import { useState } from 'react'\nimport { readFileSync } from 'node:fs'\nexport const k = process.env.K\nexport const f = (x: number, env: Env) => env\n",
    'packages/unused/package.json': lib('unused'),
  })
  const found = violations(await checkCompositionGraph(root)).join('\n')
  for (
    const expected of [
      'a -> web: an edge into an application',
      'a imports c without declaring it',
      'a declares unused but never imports it',
      'cycle: a <-> b',
      'imports the runtime or framework module react',
      'imports the runtime or framework module node:fs',
      'references process.env',
      'references a Cloudflare env parameter named env',
    ]
  ) assertStringIncludes(found, expected)
})

Deno.test('Should_Hold_When_ALibraryKeepsFewRoleEntriesAndBlocksInternals', async () => {
  const root = await workspace({
    'packages/a/package.json': lib('a', {
      exports: { '.': './src/index.ts', './server': './src/server.ts', './internal/*': null },
    }),
    'packages/a/src/internal/x.ts': 'export {}\n',
  })
  assertEquals((await checkCompositionEntries(root))._tag, 'Holds')
})

Deno.test('Should_Fail_When_EntriesExceedTheCapMirrorFoldersOrAliasEachOther', async () => {
  const many = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`./e${i}`, `./src/e${i}.ts`]))
  const root = await workspace({
    'packages/big/package.json': lib('big', { exports: many }),
    'packages/excused/package.json': lib('excused', { exports: many }),
    'packages/excused/README.md': '# excused\n\n## Composition exceptions\n\nNine roles, one per adapter.\n',
    'packages/deep/package.json': lib('deep', { exports: { './a/b': './src/a/b/c.ts' } }),
    'packages/leaky/package.json': lib('leaky', { exports: { '.': './src/index.ts' } }),
    'packages/leaky/src/internal/x.ts': 'export {}\n',
    'packages/alias/package.json': lib('alias', { exports: { '.': './src/index.ts', './old': './src/index.ts' } }),
  })
  const found = violations(await checkCompositionEntries(root))
  assert(found.some((l) => l.startsWith('packages/big') && l.includes('9 exports entries')))
  assert(!found.some((l) => l.startsWith('packages/excused')))
  assert(found.some((l) => l.includes('mirrors a source folder 2 levels deep')))
  assert(found.some((l) => l.includes('no "./internal/*": null')))
  assert(found.some((l) => l.includes('. and ./old both resolve')))
})

Deno.test('Should_Hold_When_PackagesImportOnlyExportedSpecifiersUsedByNonTestCode', async () => {
  const root = await workspace({
    'packages/a/package.json': lib('a', { exports: { '.': './src/index.ts', './role': './src/role.ts' } }),
    'packages/a/src/index.ts': 'export const a = 1\n',
    'packages/a/src/role.ts': 'export const r = 1\n',
    'apps/web/package.json': app('web'),
    'apps/web/src/main.ts': "import 'a'\nimport 'a/role'\n",
    'apps/web/tsconfig.json': '{\n  // comment\n  "compilerOptions": { "paths": { "@/*": ["./src/*"], }, },\n}\n',
  })
  assertEquals((await checkCompositionImports(root))._tag, 'Holds')
})

Deno.test('Should_Fail_When_ImportsReachUnexportedSourceAliasesOrTestOnlyExports', async () => {
  const root = await workspace({
    'packages/a/package.json': lib('a', {
      exports: { '.': './src/index.ts', './for-tests': './src/for-tests.ts' },
    }),
    'packages/a/src/index.ts': 'export const a = 1\n',
    'packages/a/src/for-tests.ts': 'export const t = 1\n',
    'packages/a/src/secret.ts': 'export const s = 1\n',
    'apps/web/package.json': app('web'),
    'apps/web/src/main.ts':
      "import 'a'\nimport 'a/secret'\nimport 'a/src/index.ts'\nimport '../../../packages/a/src/secret.ts'\n",
    'apps/web/src/main.test.ts': "import 'a/for-tests'\n",
    'apps/web/tsconfig.json': { compilerOptions: { paths: { a: ['../../packages/a/src/index.ts'] } } },
    'apps/web/vitest.config.ts': "export default { resolve: { alias: { a: '../../packages/a/src/index.ts' } } }\n",
  })
  const found = violations(await checkCompositionImports(root)).join('\n')
  for (
    const expected of [
      'imports a/secret, which a does not export',
      "imports a/src/index.ts through another package's /src/",
      'imports ../../../packages/a/src/secret.ts, a path into a',
      'paths a points into a',
      'vitest.config.ts alias points into a',
      'export ./for-tests is imported only by test files',
    ]
  ) assertStringIncludes(found, expected)
})

Deno.test('Should_Hold_When_ContractsImportContractsAndBindNoLayer', async () => {
  const root = await workspace({
    'packages/base/package.json': lib('base', { role: 'contracts' }),
    'packages/base/src/index.ts': 'export const b = 1\n',
    'packages/rpc/package.json': lib('rpc', { role: 'contracts', dependencies: { base: 'workspace:*' } }),
    'packages/rpc/src/index.ts': "import 'base'\nexport const x = 1\n",
  })
  assertEquals((await checkCompositionContracts(root))._tag, 'Holds')
})

Deno.test('Should_Fail_When_ContractsImportAnImplementationOrDefineALayer', async () => {
  const root = await workspace({
    'packages/impl/package.json': lib('impl'),
    'packages/impl/src/index.ts': 'export const i = 1\n',
    'packages/rpc/package.json': lib('rpc', { role: 'contracts' }),
    'packages/rpc/src/index.ts': "import 'impl'\nexport const live = Layer.succeed(Tag, 1)\n",
  })
  const found = violations(await checkCompositionContracts(root)).join('\n')
  assertStringIncludes(found, 'imports impl, which is not contracts')
  assertStringIncludes(found, 'defines a Layer (Layer.succeed)')
})

const sh = async (cwd: string, ...args: string[]) => {
  const out = await new Deno.Command('git', {
    args: ['-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...args],
    cwd,
    stderr: 'piped',
    stdout: 'piped',
  }).output()
  assert(out.success, new TextDecoder().decode(out.stderr))
}

const commitEach = async (root: string, touches: readonly (readonly string[])[]) => {
  await sh(root, 'init', '-q')
  for (const [i, paths] of touches.entries()) {
    for (const path of paths) await Deno.writeTextFile(join(root, path), `${i}\n`)
    await sh(root, 'add', '-A')
    await sh(root, 'commit', '-q', '-m', `c${i}`)
  }
}

Deno.test('Should_ReportButHold_When_AGranularityFindingIsNotStrict_And_FailWhenStrict', async () => {
  const root = await workspace({
    'packages/shared/package.json': lib('shared'),
    'packages/shared/src/index.ts': 'export const s = 1\n',
    'packages/only/package.json': lib('only', { dependencies: { shared: 'workspace:*' } }),
    'packages/only/src/index.ts': "import 'shared'\n",
    'apps/web/package.json': app('web', { dependencies: { only: 'workspace:*', shared: 'workspace:*' } }),
    'apps/web/src/main.ts': "import 'only'\nimport 'shared'\n",
  })
  // shared has two dependents; only has one (web) and is unpublished.
  await commitEach(root, [['packages/shared/src/a.ts', 'packages/only/src/a.ts']])
  const lenient = await checkCompositionGranularity(root, false)
  assertEquals(lenient._tag, 'Holds')
  if (lenient._tag === 'Holds') assertStringIncludes(lenient.summary, 'packages/only (only): one dependent (web)')
  const strict = await checkCompositionGranularity(root, true)
  assertEquals(strict._tag, 'Violated')
})

Deno.test('Should_Hold_When_NoLibraryHasOneDependentAndPairsChangeApart', async () => {
  const root = await workspace({
    'packages/a/package.json': lib('a'),
    'packages/b/package.json': lib('b'),
    'apps/x/package.json': app('x', { dependencies: { a: 'workspace:*', b: 'workspace:*' } }),
    'apps/x/src/main.ts': "import 'a'\nimport 'b'\n",
    'apps/y/package.json': app('y', { dependencies: { a: 'workspace:*', b: 'workspace:*' } }),
    'apps/y/src/main.ts': "import 'a'\nimport 'b'\n",
  })
  await commitEach(root, Array.from({ length: 12 }, (_, i) => [i % 2 === 0 ? 'packages/a/f.txt' : 'packages/b/f.txt']))
  const verdict = await checkCompositionGranularity(root, true)
  assertEquals(verdict._tag, 'Holds')
})

Deno.test('Should_FlagAPairOnlyAbove80PercentOverTheWindow_When_CountingCoChange', () => {
  const together = new Set(['a', 'b'])
  const apart = new Set(['a'])
  assertEquals(coChanged([...Array(9).fill(together), apart]), [{ a: 'a', b: 'b', together: 9, of: 10 }])
  assertEquals(coChanged([...Array(8).fill(together), apart, apart]), [])
  assertEquals(coChanged(Array(5).fill(together)), [])
})

Deno.test('Should_JudgeAnUndeclaredUnitAsALibrary_When_CheckingEntries', async () => {
  const many = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`./e${i}`, `./src/e${i}.ts`]))
  const root = await workspace({ 'packages/undeclared/package.json': { name: 'undeclared', exports: many } })
  assertEquals(violations(await checkCompositionEntries(root)).length, 1)
})

Deno.test('Should_CatchEveryCloudflareEnvParameterForm_And_IgnoreEnvironment_When_CheckingGraph', async () => {
  const forms = [
    'export default { fetch(req: Request, { env }: { env: Env }) { return env } }',
    'export const f = (env: Bindings) => env',
    'export const f = (req: Request, env: Cloudflare.Env) => env',
    'export default { fetch(req: Request, { env }) { return env } }',
  ]
  for (const form of forms) {
    const root = await workspace({ 'packages/a/package.json': lib('a'), 'packages/a/src/index.ts': form + '\n' })
    const found = violations(await checkCompositionGraph(root)).join('\n')
    assertStringIncludes(found, 'env', form)
    assert(found.includes('references'), `not reported: ${form}`)
  }
  const clean = await workspace({
    'packages/a/package.json': lib('a'),
    'packages/a/src/index.ts': 'export const f = (env: Environment) => env\n',
  })
  assertEquals((await checkCompositionGraph(clean))._tag, 'Holds')
})

Deno.test('Should_RunLibraryChecksOnUndeclaredUnits_When_CheckingGraph', async () => {
  const root = await workspace({
    'packages/a/package.json': { name: 'a', layer: 'core' },
    'packages/a/src/index.ts': "import 'react'\nexport const k = process.env.K\n",
  })
  const found = violations(await checkCompositionGraph(root)).join('\n')
  assertStringIncludes(found, 'imports the runtime or framework module react')
  assertStringIncludes(found, 'references process.env')
})

Deno.test('Should_NotTreatLiteralsAsCode_When_ExtractingImportsAndEnvReferences', async () => {
  const root = await workspace({
    'packages/a/package.json': lib('a', { exports: { '.': './src/index.ts' } }),
    'packages/a/src/index.ts': [
      "export const doc = 'process.env'",
      "export const fixture = `import { run } from 'b/main'`",
      "export const re = /'/",
      "export const nested = `x ${`import 'b/inner'`} ${1}`",
      "// import 'b/commented'",
      '',
    ].join('\n'),
    'packages/b/package.json': lib('b', { exports: { '.': './src/index.ts' } }),
    'packages/b/src/index.ts': 'export const b = 1\n',
  })
  assertEquals((await checkCompositionGraph(root))._tag, 'Holds')
  assertEquals((await checkCompositionImports(root))._tag, 'Holds')
})

Deno.test('Should_NotJudgeBuiltOutputTargets_When_CheckingEntries', async () => {
  const root = await workspace({
    'packages/a/package.json': lib('a', {
      exports: {
        './x/y': {
          source: './src/x.ts',
          types: './dist/types/x/y/index.d.ts',
          default: './dist/esm/x/y/index.js',
        },
      },
    }),
  })
  assertEquals((await checkCompositionEntries(root))._tag, 'Holds')
})

Deno.test('Should_ExemptRootAndPublishedLibraries_When_CheckingTestOnlyExports', async () => {
  const root = await workspace({
    'packages/leaf/package.json': lib('leaf', { exports: { '.': './src/index.ts' } }),
    'packages/leaf/src/index.ts': 'export const x = 1\n',
    'packages/leaf/src/index.test.ts': "import 'leaf'\n",
    'packages/pub/package.json': lib('pub', {
      private: false,
      exports: { '.': './src/index.ts', './extra': './src/extra.ts' },
    }),
    'packages/pub/src/index.ts': 'export const p = 1\n',
    'packages/pub/src/extra.ts': 'export const e = 1\n',
    'packages/pub/src/index.test.ts': "import 'pub/extra'\n",
  })
  assertEquals((await checkCompositionImports(root))._tag, 'Holds')
})
