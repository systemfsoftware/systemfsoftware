import { assert, assertEquals, assertStringIncludes } from '@std/assert'
import { dirname, fromFileUrl, join } from '@std/path'
import { readCases, shapesOf } from './composition-calibrate.ts'
import { candidateCases } from './composition-cases.ts'
import {
  type Judge,
  makeJudge,
  openRouterTransport,
  parseRecorded,
  recordKey,
  replayTransport,
  type Request,
  type Transport,
} from './composition-judge.ts'
import { DEFAULT_MODELS, fingerprintOf, JUDGED_RULES, shapeOf } from './composition-judge.ts'
import {
  checkCompositionContracts,
  checkCompositionCoreAdapters,
  checkCompositionEntries,
  checkCompositionGranularity,
  checkCompositionGraph,
  checkCompositionImports,
  checkCompositionUnitKinds,
  coChanged,
} from './composition.ts'
import { resolveExports } from './package-exports.ts'
import type { Verdict } from './verdict.ts'

// Each test writes a small real workspace to a temp directory and runs the check, and so the TypeScript compiler, on it.
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
const text = (verdict: Verdict): string =>
  verdict._tag === 'Violated' ? `${verdict.violations.join('\n')}\n${verdict.why}` : verdict.summary

const lib = (name: string, extra: object = {}) => ({
  name,
  unit: 'library',
  private: true,
  exports: { '.': './src/index.ts' },
  ...extra,
})
const app = (name: string, extra: object = {}) => ({ name, unit: 'application', private: true, ...extra })

// ------------------------------------------------------------------ unit kinds

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

// ----------------------------------------------------------------------- graph

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
      "import { useState } from 'react'\nimport { readFileSync } from 'node:fs'\nexport const k = process.env.K\n",
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
    ]
  ) assertStringIncludes(found, expected)
})

Deno.test('Should_FailOnlyALibraryThatNeverImportsADeclaredDependency_And_ReportTheRest', async () => {
  // An application or template may install a toolchain it never imports (a container's tools); a library cannot use it.
  const root = await workspace({
    'packages/dep/package.json': lib('dep'),
    'packages/dep/src/index.ts': 'export const d = 1\n',
    'packages/lib/package.json': lib('lib', { dependencies: { dep: 'workspace:*' } }),
    'packages/lib/src/index.ts': 'export const l = 1\n',
    'apps/sandbox/package.json': app('sandbox', { dependencies: { dep: 'workspace:*' } }),
    'apps/sandbox/src/main.ts': 'export const s = 1\n',
    'packages/template/package.json': { name: 'template', unit: 'template', dependencies: { dep: 'workspace:*' } },
    'packages/untyped/package.json': { name: 'untyped', private: true, dependencies: { dep: 'workspace:*' } },
  })
  const verdict = await checkCompositionGraph(root)
  assertEquals(violations(verdict), ['lib declares dep but never imports it'])
  const reported = text(verdict)
  assertStringIncludes(
    reported,
    'sandbox declares dep but never imports it (application: may be installed as a toolchain)',
  )
  assertStringIncludes(reported, 'untyped declares dep but never imports it (kind not declared')
})

Deno.test('Should_NotCountAnImportInsideAStringTemplateOrComment_When_BuildingTheImportGraph', async () => {
  // The review found imports inside string literals counted: the compiler reads declarations, not text.
  const root = await workspace({
    'packages/a/package.json': lib('a'),
    'packages/a/src/index.ts': [
      "export const doc = 'process.env'",
      "export const fixture = `import { run } from 'b/main'`",
      "export const re = /'/",
      "export const nested = `x ${`import 'b/inner'`} ${1}`",
      'export const rule = { code: "import \'b\'\\nconst x = process.env.K" }',
      "// import 'b/commented'",
      '',
    ].join('\n'),
    'packages/a/src/rule.test.ts': 'export const sample = "import { x } from \'b\'"\n',
    'packages/b/package.json': lib('b'),
    'packages/b/src/index.ts': 'export const b = 1\n',
  })
  assertEquals((await checkCompositionGraph(root))._tag, 'Holds')
  assertEquals((await checkCompositionImports(root))._tag, 'Holds')
})

Deno.test('Should_CountTypeOnlyImportsAsEdgesButNotAsRuntimeImports_When_CheckingACoreLibrary', async () => {
  const root = await workspace({
    'packages/a/package.json': lib('a', { layer: 'core' }),
    'packages/a/src/index.ts':
      "import type { ReactNode } from 'react'\nimport { type FC } from 'react'\nexport type X = ReactNode | FC\n",
  })
  assertEquals((await checkCompositionGraph(root))._tag, 'Holds')
  const value = await workspace({
    'packages/a/package.json': lib('a', { layer: 'core' }),
    'packages/a/src/index.ts': "import { useState } from 'react'\nexport const x = useState\n",
  })
  assertStringIncludes(text(await checkCompositionGraph(value)), 'imports the runtime or framework module react')
})

// Cloudflare's types, as `wrangler types` or @cloudflare/workers-types declare them: the Env interface in
// `namespace Cloudflare` and the binding classes. The compiler resolves them, so no name in our code decides.
const CLOUDFLARE_DECLARATIONS = [
  'declare namespace Cloudflare {',
  '  interface Env {}',
  '  interface WebSocket {}',
  '}',
  'interface Env extends Cloudflare.Env {}',
  'declare abstract class KVNamespace { get(key: string): Promise<string | null> }',
  'declare abstract class D1Database { prepare(sql: string): unknown }',
  'declare abstract class R2Bucket { head(key: string): Promise<unknown> }',
  'interface ExecutionContext { waitUntil(p: Promise<unknown>): void }',
  '',
].join('\n')

const cloudflareTypesPackage = {
  'node_modules/@cloudflare/workers-types/package.json': {
    name: '@cloudflare/workers-types',
    version: '4.0.0',
    types: 'index.d.ts',
  },
  'node_modules/@cloudflare/workers-types/index.d.ts': CLOUDFLARE_DECLARATIONS,
  'packages/a/tsconfig.json': {
    compilerOptions: { types: ['@cloudflare/workers-types'], module: 'esnext', moduleResolution: 'bundler' },
  },
}

const withSource = async (
  source: string,
  extra: Readonly<Record<string, string | object>> = {},
): Promise<string> =>
  await workspace({
    'packages/a/package.json': lib('a'),
    'packages/a/src/index.ts': source + '\n',
    ...extra,
  })

Deno.test('Should_CatchEveryCloudflareEnvForm_When_TheCompilerResolvesCloudflaresTypes', async () => {
  const worker = 'interface Bindings { DB: D1Database; KV: KVNamespace }\n'
  const forms: Readonly<Record<string, string>> = {
    'destructured env, typed':
      `${worker}export default { fetch(req: Request, { env }: { env: Bindings }) { return env } }`,
    'env parameter of Cloudflare Env': 'export const f = (env: Env) => env',
    'parameter of any name with an Env type': 'export const f = (req: Request, bindings: Env) => bindings',
    'env of a bindings type by another name':
      'interface WorkerBindings { BUCKET: R2Bucket }\nexport const f = (env: WorkerBindings) => env',
    'Cloudflare.Env': 'export const f = (req: Request, env: Cloudflare.Env) => env',
    'an interface extending Cloudflare.Env':
      'interface Mine extends Cloudflare.Env { extra: string }\nexport const f = (anything: Mine) => anything',
    'this.env in a class':
      `${worker}export class Room { constructor(readonly env: Bindings) {}\n get db() { return this.env.DB } }`,
    'env from cloudflare:workers': "import { env } from 'cloudflare:workers'\nexport const db = env.DB",
  }
  for (const [name, source] of Object.entries(forms)) {
    const root = await withSource(source, cloudflareTypesPackage)
    assertStringIncludes(text(await checkCompositionGraph(root)), 'references cloudflare-env', name)
  }
  const clean: Readonly<Record<string, string>> = {
    'env typed Environment': 'export const f = (env: Environment) => env\ninterface Environment { name: string }',
    'an interface named Bindings with no Cloudflare binding':
      'export interface Bindings { logger: () => void }\nexport const f = (b: Bindings) => b',
    'a service holding a Cloudflare type that is not a binding':
      'interface Holder { ctx: ExecutionContext }\nexport const f = (h: Holder) => h',
    'a Cloudflare type that is not the env': 'export const f = (socket: Cloudflare.WebSocket) => socket',
    'a local named env of another kind': 'export const f = (env: Record<string, string>) => env',
    "a library's own KVNamespace":
      'class KVNamespace { get() { return 1 } }\ninterface Cache { kv: KVNamespace }\nexport const f = (cache: Cache) => cache',
  }
  for (const [name, source] of Object.entries(clean)) {
    const root = await withSource(source, cloudflareTypesPackage)
    assertEquals((await checkCompositionGraph(root))._tag, 'Holds', name)
  }
})

Deno.test('Should_ReadTheEnvFromAWranglerGeneratedDeclarationFile_When_NoTypesPackageIsInstalled', async () => {
  // `wrangler types` writes worker-configuration.d.ts into the unit: the compiler reads Cloudflare's declarations there.
  const root = await withSource('export const f = (req: Request, env: Env) => env', {
    'packages/a/worker-configuration.d.ts': CLOUDFLARE_DECLARATIONS,
  })
  assertStringIncludes(text(await checkCompositionGraph(root)), 'references cloudflare-env')
})

Deno.test('Should_NotFlagAParameterNamedEnvByItsName_When_TheCompilerCannotResolveItsType', async () => {
  // Review: `({ env }) => env` and `configResolved({ env }: any)` were Violated purely by the name `env`; a bindings
  // interface over classes nobody declared is not Cloudflare's either. With no type resolved no name decides.
  const forms: Readonly<Record<string, string>> = {
    'destructured env, no type': 'export const f = ({ env }) => env',
    'destructured env typed any': 'export const plugin = { configResolved({ env }: any) { return env } }',
    'a parameter named env typed unknown': 'export const f = (env: unknown) => env',
    'a local Env interface with local binding-named classes':
      'declare class KVNamespace {}\ninterface Env { KV: KVNamespace }\nexport const f = (env: Env) => env',
    'an Env type from an uninstalled package':
      "import type { Env } from '@cloudflare/not-installed'\nexport const f = (env: Env) => env",
  }
  for (const [name, source] of Object.entries(forms)) {
    const root = await withSource(source)
    assertEquals((await checkCompositionGraph(root))._tag, 'Holds', name)
  }
  const uninstalled = await withSource(
    "import type { Env } from '@cloudflare/not-installed'\nexport const f = (env: Env) => env",
  )
  assertStringIncludes(
    text(await checkCompositionGraph(uninstalled)),
    '1 libraries import packages the compiler cannot resolve',
  )
})

Deno.test('Should_FindProcessDenoAndMetaEnv_And_IgnoreALocalWithTheSameName_When_CheckingConfigAtTheEdge', async () => {
  const forms: Readonly<Record<string, string>> = {
    'process.env': 'export const a = process.env.A',
    'process.env, element access': "export const a = process['env']",
    'globalThis.process.env': 'export const a = globalThis.process.env.A',
    'destructured from process': 'export const { env } = process',
    'Deno.env': "export const a = Deno.env.get('A')",
    'import.meta.env': 'export const a = (import.meta as { env: Record<string, string> }).env.A',
    'process imported from node:process': "import process from 'node:process'\nexport const a = process.env.A",
    'env named-imported from node:process': "import { env } from 'node:process'\nexport const a = env.A",
    'env renamed on import from node:process': "import { env as e } from 'node:process'\nexport const a = e.A",
    'node:process as a namespace': "import * as p from 'node:process'\nexport const a = p.env.A",
    'node:process default under another name': "import proc from 'node:process'\nexport const a = proc.env.A",
    'a local alias of process': 'const p = process\nexport const a = p.env.A',
    'a local alias of an alias': 'const p = process\nconst q = p\nexport const a = q.env.A',
    'a local alias of Deno': "const d = Deno\nexport const a = d.env.get('A')",
    'destructured from an alias': 'const p = process\nexport const { env } = p',
  }
  for (const [name, source] of Object.entries(forms)) {
    const root = await withSource(source)
    assertStringIncludes(text(await checkCompositionGraph(root)), 'only applications read configuration', name)
  }
  const local = await withSource('const process = { env: { A: 1 } }\nexport const a = process.env.A')
  assertEquals((await checkCompositionGraph(local))._tag, 'Holds')
  const other = await withSource("import { env } from './env.ts'\nexport const a = env.A", {
    'packages/a/src/env.ts': 'export const env = { A: 1 }\n',
  })
  assertEquals((await checkCompositionGraph(other))._tag, 'Holds')
})

Deno.test('Should_AllowConfigInAnApplicationAndAToolConfig_When_CheckingConfigAtTheEdge', async () => {
  const root = await workspace({
    'apps/web/package.json': app('web'),
    'apps/web/src/main.ts': 'export const a = process.env.A\n',
    'packages/a/package.json': lib('a'),
    'packages/a/src/index.ts': 'export const a = 1\n',
    'packages/a/vitest.config.ts': 'export default { test: { env: process.env } }\n',
  })
  assertEquals((await checkCompositionGraph(root))._tag, 'Holds')
})

Deno.test('Should_AttributeNestedUnitFilesToTheNestedUnit_When_BuildingTheImportGraph', async () => {
  const root = await workspace({
    'pnpm-workspace.yaml': 'packages:\n  - packages/*\n  - packages/outer/inner\n',
    'packages/outer/package.json': lib('outer'),
    'packages/outer/src/index.ts': 'export const o = 1\n',
    'packages/outer/inner/package.json': lib('inner', { exports: { '.': './index.ts' } }),
    'packages/outer/inner/index.ts': "import './helper.ts'\nexport const i = 1\n",
    'packages/outer/inner/helper.ts': 'export const h = 1\n',
  })
  assertEquals((await checkCompositionImports(root))._tag, 'Holds')
})

// -------------------------------------------------------------------- contracts

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
    'packages/rpc/src/index.ts':
      "import 'impl'\nimport { Layer } from 'effect'\nexport const live = Layer.succeed(Tag, 1)\n",
  })
  const found = violations(await checkCompositionContracts(root)).join('\n')
  assertStringIncludes(found, 'imports impl, which is not contracts')
  assertStringIncludes(found, 'defines a Layer (Layer.succeed)')
})

Deno.test('Should_ResolveLayerCallsToEffectsLayerModule_When_EffectIsNotInstalled', async () => {
  // Without the package on disk the compiler has only the module each import names: the named forms are still found.
  const layerFiles: Readonly<Record<string, string>> = {
    'renamed namespace member': "import { Layer as L } from 'effect'\nexport const a = L.effect(Tag, make)",
    'module namespace': "import * as Layer from 'effect/Layer'\nexport const a = Layer.scoped(Tag, make)",
    'module member import': "import { succeed as provide } from 'effect/Layer'\nexport const a = provide(Tag, 1)",
    'local alias of Layer': "import { Layer } from 'effect'\nconst L = Layer\nexport const a = L.sync(Tag, make)",
    'whole effect namespace': "import * as E from 'effect'\nexport const a = E.Layer.succeed(Tag, 1)",
    'destructured member':
      "import { Layer } from 'effect'\nconst { succeed } = Layer\nexport const a = succeed(Tag, 1)",
    'a bare member reference': "import { Layer } from 'effect'\nexport const make = Layer.succeed",
    'a named re-export through a barrel': "import { Layer } from './barrel.ts'\nexport const a = Layer.succeed(Tag, 1)",
  }
  for (const [name, source] of Object.entries(layerFiles)) {
    const root = await workspace({
      'packages/rpc/package.json': lib('rpc', { role: 'contracts' }),
      'packages/rpc/src/index.ts': source + '\n',
      'packages/rpc/src/barrel.ts': "export { Layer } from 'effect'\n",
    })
    assertStringIncludes(text(await checkCompositionContracts(root)), 'defines a Layer', name)
  }
  // An object that merely has a `Layer.succeed` of its own is not effect's Layer.
  const lookalike = await workspace({
    'packages/rpc/package.json': lib('rpc', { role: 'contracts' }),
    'packages/rpc/src/index.ts': 'const Layer = { succeed: (a: number) => a }\nexport const a = Layer.succeed(1)\n',
  })
  assertEquals((await checkCompositionContracts(lookalike))._tag, 'Holds')
})

// A small effect on disk: an index that re-exports the Layer module as a namespace, as effect does.
const effectOnDisk = (name = 'effect') => ({
  [`node_modules/${name}/package.json`]: {
    name,
    version: '4.0.0',
    exports: { '.': { types: './index.d.ts' }, './Layer': { types: './Layer.d.ts' } },
  },
  [`node_modules/${name}/index.d.ts`]:
    "export * as Layer from './Layer'\nexport declare const Effect: { succeed: (a: number) => number }\n",
  [`node_modules/${name}/Layer.d.ts`]:
    'export interface Layer<A> { readonly a: A }\nexport declare const succeed: <A>(a: A) => Layer<A>\nexport declare const effect: <A>(a: A) => Layer<A>\n',
  'packages/rpc/tsconfig.json': { compilerOptions: { module: 'esnext', moduleResolution: 'bundler' } },
})

Deno.test('Should_ResolveLayerSymbolsThroughTheAliasChain_When_EffectIsInstalled', async () => {
  // Review probes that slipped past specifier matching: a destructured member, a bare reference, a barrel re-export
  // (named and `export *`), a re-export of the Layer module under another name.
  const forms: Readonly<Record<string, string>> = {
    'destructured member': "import { Layer } from 'effect'\nconst { succeed } = Layer\nexport const a = succeed(1)",
    'a bare member reference': "import { Layer } from 'effect'\nexport const make = Layer.succeed",
    'a member reference through a local alias':
      "import { Layer } from 'effect'\nconst L = Layer\nconst make = L.succeed\nexport { make }",
    'named barrel re-export': "import { Layer } from './barrel.ts'\nexport const a = Layer.succeed(1)",
    'star barrel re-export': "import { Layer } from './star.ts'\nexport const a = Layer.succeed(1)",
    'barrel renaming the module': "import { Context } from './rename.ts'\nexport const a = Context.effect(1)",
    'namespace import of the module': "import * as Layer from 'effect/Layer'\nexport const a = Layer.effect(1)",
    'a member imported from the module': "import { succeed } from 'effect/Layer'\nexport const a = succeed(1)",
    'a member imported through a barrel': "import { succeed } from './members.ts'\nexport const a = succeed(1)",
  }
  for (const [name, source] of Object.entries(forms)) {
    const root = await workspace({
      ...effectOnDisk(),
      'packages/rpc/package.json': lib('rpc', { role: 'contracts' }),
      'packages/rpc/src/index.ts': source + '\n',
      'packages/rpc/src/barrel.ts': "export { Layer } from 'effect'\n",
      'packages/rpc/src/star.ts': "export * from 'effect'\n",
      'packages/rpc/src/rename.ts': "export { Layer as Context } from 'effect'\n",
      'packages/rpc/src/members.ts': "export { succeed } from 'effect/Layer'\n",
    })
    assertStringIncludes(text(await checkCompositionContracts(root)), 'defines a Layer', name)
  }
  const types = await workspace({
    ...effectOnDisk(),
    'packages/rpc/package.json': lib('rpc', { role: 'contracts' }),
    'packages/rpc/src/index.ts':
      "import { Layer } from 'effect'\nimport type { Layer as L } from 'effect/Layer'\nexport type A = Layer.Layer<number> | L<string>\nexport const x: typeof Layer = Layer\n",
  })
  assertEquals((await checkCompositionContracts(types))._tag, 'Holds')
})

Deno.test('Should_NotTreatAnotherPackagesLayerAsEffects_When_TheCompilerResolvesWhereItLives', async () => {
  const root = await workspace({
    ...effectOnDisk('not-effect'),
    'packages/rpc/package.json': lib('rpc', { role: 'contracts' }),
    'packages/rpc/src/index.ts':
      "import { Layer } from 'not-effect'\nconst { succeed } = Layer\nexport const a = succeed(1)\nexport const b = Layer.effect(1)\n",
  })
  assertEquals((await checkCompositionContracts(root))._tag, 'Holds')
})

// ---------------------------------------------------------------------- entries

Deno.test('Should_Hold_When_ALibraryKeepsFewRoleEntriesAndBlocksInternals', async () => {
  const root = await workspace({
    'packages/a/package.json': lib('a', {
      exports: { '.': './src/index.ts', './server': './src/server.ts', './internal/*': null },
    }),
    'packages/a/src/internal/x.ts': 'export {}\n',
  })
  assertEquals((await checkCompositionEntries(root))._tag, 'Holds')
})

Deno.test('Should_NotCountPackageJsonOrTheInternalBlock_When_ALibraryPublishesEightRoles', async () => {
  // Review: 8 real roles plus the "./package.json" and "./internal/*": null the standard itself demands counted as 10.
  const roles = Object.fromEntries(
    ['.', './server', './react', './vue', './solid', './testing', './node', './browser'].map((k, i) => [
      k,
      `./src/e${i}.ts`,
    ]),
  )
  const root = await workspace({
    'packages/a/package.json': lib('a', {
      exports: { ...roles, './package.json': './package.json', './internal/*': null },
    }),
    'packages/a/src/internal/x.ts': 'export {}\n',
  })
  const verdict = await checkCompositionEntries(root)
  assertEquals(verdict._tag, 'Holds')
  assert(!text(verdict).includes('role entries, over'), text(verdict))
})

Deno.test('Should_ReportAndNeverFailALibraryOverTheRoleEntryGuide_When_NoJudgeIsConfigured', async () => {
  // Vitest, effect and TanStack publish more than 8 entries and the rubric allows it: the count is a report and
  // evidence for the judge, never a failure. Nothing reads the README to excuse it.
  const many = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`./role${i}`, `./src/e${i}.ts`]))
  const root = await workspace({
    'packages/big/package.json': lib('big', { exports: many }),
    'packages/big/README.md': '```md\n## Composition exceptions\n```\n',
  })
  const verdict = await checkCompositionEntries(root)
  assertEquals(verdict._tag, 'Holds')
  assertStringIncludes(text(verdict), 'packages/big (big): 9 role entries, over the guide of 8')
  assertStringIncludes(text(verdict), 'entries-are-roles: 1 candidate(s) not judged')
})

Deno.test('Should_Fail_When_ALibraryLacksAnInternalBlockOrAliasesAnEntry', async () => {
  const root = await workspace({
    'packages/leaky/package.json': lib('leaky', { exports: { '.': './src/index.ts' } }),
    'packages/leaky/src/internal/x.ts': 'export {}\n',
    'packages/alias/package.json': lib('alias', { exports: { '.': './src/index.ts', './old': './src/index.ts' } }),
  })
  const found = violations(await checkCompositionEntries(root))
  assert(found.some((l) => l.includes('no "./internal/*": null')))
  assert(found.some((l) => l.includes('. and ./old both resolve')))
})

Deno.test('Should_JudgeAnUndeclaredUnitAsALibrary_When_CheckingEntries', async () => {
  const root = await workspace({
    'packages/undeclared/package.json': { name: 'undeclared', exports: { '.': './src/index.ts' } },
    'packages/undeclared/src/internal/x.ts': 'export {}\n',
  })
  assertEquals(violations(await checkCompositionEntries(root)).length, 1)
})

Deno.test('Should_NotFailOnBuiltOutputTargetsOrALeafRoot_When_NoJudgeIsConfigured_And_ReportThemForTheJudge', async () => {
  const root = await workspace({
    'packages/a/package.json': lib('a', {
      exports: {
        '.': { source: './src/index.ts', types: './dist/index.d.ts', default: './dist/index.js' },
        './x/y': { source: './src/x.ts', types: './dist/types/x/y/index.d.ts', default: './dist/esm/x/y/index.js' },
      },
    }),
    'packages/a/src/index.ts': 'export const a = 1\n',
    'packages/a/src/index.test.ts': "import 'a'\n",
  })
  const entries = await checkCompositionEntries(root)
  assertEquals(entries._tag, 'Holds')
  assertStringIncludes(text(entries), 'entries-are-roles: 1 candidate(s) not judged')
  const imports = await checkCompositionImports(root)
  assertEquals(imports._tag, 'Holds')
  assertStringIncludes(text(imports), 'test-only-exports: 1 candidate(s) not judged')
})

// ---------------------------------------------------------------------- imports

Deno.test('Should_Hold_When_PackagesImportOnlyExportedSpecifiers', async () => {
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

Deno.test('Should_Fail_When_ImportsReachUnexportedSourcePathsOrAliasesIntoAnotherPackage', async () => {
  const root = await workspace({
    'packages/a/package.json': lib('a', { exports: { '.': './src/index.ts', './internal/*': null } }),
    'packages/a/src/index.ts': 'export const a = 1\n',
    'packages/a/src/secret.ts': 'export const s = 1\n',
    'packages/a/src/internal/x.ts': 'export const x = 1\n',
    'apps/web/package.json': app('web'),
    'apps/web/src/main.ts':
      "import 'a'\nimport 'a/secret'\nimport 'a/src/index.ts'\nimport 'a/internal/x'\nimport '../../../packages/a/src/secret.ts'\n",
    'apps/web/tsconfig.json': { compilerOptions: { paths: { a: ['../../packages/a/src/index.ts'] } } },
    'apps/web/vitest.config.ts': "export default { resolve: { alias: { a: '../../packages/a/src/index.ts' } } }\n",
  })
  const found = violations(await checkCompositionImports(root)).join('\n')
  for (
    const expected of [
      'imports a/secret, which a does not export',
      'imports a/src/index.ts, which a does not export',
      'imports a/internal/x, which a does not export',
      'imports ../../../packages/a/src/secret.ts, a path into a',
      'tsconfig paths a points into a',
      'bundler alias points into a',
    ]
  ) assertStringIncludes(found, expected)
})

Deno.test('Should_FollowTheExportsMapsConditionsAndPatterns_When_ResolvingASpecifier', () => {
  const manifest = {
    exports: {
      '.': { '@scope/source': './src/index.ts', types: './dist/index.d.ts', default: './dist/index.js' },
      './*': { '@scope/source': './src/*.ts', default: './dist/*.js' },
      './internal/*': null,
      './fixed': ['./src/fixed.ts'],
    },
  }
  const source = new Set(['@scope/source', 'types'])
  assertEquals(resolveExports(manifest, '.', source), { key: '.', target: './src/index.ts' })
  assertEquals(resolveExports(manifest, '.', new Set()), { key: '.', target: './dist/index.js' })
  assertEquals(resolveExports(manifest, './role', source), { key: './*', target: './src/role.ts' })
  assertEquals(resolveExports(manifest, './internal/x', source), { key: './internal/*', target: null })
  assertEquals(resolveExports(manifest, './fixed', source), { key: './fixed', target: './src/fixed.ts' })
  assertEquals(resolveExports({ name: 'no-exports' }, '.', source), undefined)
})

// ------------------------------------------------------------------ granularity

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

Deno.test('Should_FlagAPairOnlyAbove80PercentOverTheWindow_When_CountingCoChange', () => {
  const together = new Set(['a', 'b'])
  const apart = new Set(['a'])
  assertEquals(coChanged([...Array(9).fill(together), apart]), [{ a: 'a', b: 'b', together: 9, of: 10 }])
  assertEquals(coChanged([...Array(8).fill(together), apart, apart]), [])
  assertEquals(coChanged(Array(5).fill(together)), [])
})

Deno.test('Should_NotJudgeGranularityWithoutAJudge_When_ALibraryHasOneDependent', async () => {
  const root = await workspace(singleDependent)
  await commitEach(root, [['packages/shared/src/a.ts', 'packages/only/src/a.ts']])
  const verdict = await checkCompositionGranularity(root, true)
  assertEquals(verdict._tag, 'Holds')
  assertStringIncludes(text(verdict), 'granularity: 1 candidate(s) not judged')
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

Deno.test('Should_ReportRuntimeImportsToTheJudgeOnly_When_CheckingCoreAndAdapters', async () => {
  const root = await workspace({
    'packages/a/package.json': lib('a'),
    'packages/a/src/index.ts': "import { readFileSync } from 'node:fs'\nexport const a = readFileSync\n",
    'packages/neutral/package.json': lib('neutral'),
    'packages/neutral/src/index.ts': 'export const n = 1\n',
  })
  const verdict = await checkCompositionCoreAdapters(root)
  assertEquals(verdict._tag, 'Holds')
  assertStringIncludes(text(verdict), 'core-adapter-split: 1 candidate(s) not judged')
})

// --------------------------------------- judged rules, with recorded model answers

const singleDependent = {
  'packages/shared/package.json': lib('shared'),
  'packages/shared/src/index.ts': 'export const s = 1\n',
  'packages/only/package.json': lib('only', { dependencies: { shared: 'workspace:*' } }),
  'packages/only/src/index.ts': "import 'shared'\n",
  'apps/web/package.json': app('web', { dependencies: { only: 'workspace:*', shared: 'workspace:*' } }),
  'apps/web/src/main.ts': "import 'only'\nimport 'shared'\n",
}

const HERE = dirname(fromFileUrl(import.meta.url))
const RECORDED_CHECKS = join(HERE, 'calibration', 'recorded-checks.jsonl')

/**
 * The model answers for the evidence of the fixtures above, recorded from the real judge models. They replay
 * from calibration/recorded-checks.jsonl; REPO_CHECKS_RECORD=1 with OPENROUTER_API_KEY asks the models again and rewrites the file.
 */
const recordedTransport = async (): Promise<Transport> => {
  const key = Deno.env.get('OPENROUTER_API_KEY')
  if (Deno.env.get('REPO_CHECKS_RECORD') === '1' && key !== undefined && key !== '') {
    const live = openRouterTransport(key)
    return async (request: Request) => {
      const response = await live(request)
      await Deno.writeTextFile(
        RECORDED_CHECKS,
        JSON.stringify({ key: await recordKey(request), model: request.model, response }) + '\n',
        { append: true },
      )
      return response
    }
  }
  return replayTransport(parseRecorded(await Deno.readTextFile(RECORDED_CHECKS).catch(() => '')))
}

const judgeWith = async (
  rule: 'entries-are-roles' | 'test-only-exports' | 'granularity' | 'core-adapter-split',
  kappa: number | undefined,
): Promise<Judge> => {
  const shapes = shapesOf(await readCases())
  return makeJudge(
    await recordedTransport(),
    DEFAULT_MODELS,
    kappa === undefined
      ? {}
      : { [rule]: { kappa, cases: 20, fingerprint: await fingerprintOf(rule, DEFAULT_MODELS, shapes[rule]) } },
    shapes,
  )
}

const testOnlyFixture = {
  'packages/a/package.json': lib('a', { exports: { '.': './src/index.ts', './vault/laws': './src/vault/laws.ts' } }),
  'packages/a/src/index.ts': 'export const a = 1\n',
  'packages/a/src/vault/laws.ts': 'export const laws = 1\n',
  'packages/a/tests/vault.integration.test.ts': "import 'a/vault/laws'\nimport 'a'\n",
  'apps/web/package.json': app('web', { dependencies: { a: 'workspace:*' } }),
  'apps/web/src/main.ts': "import 'a'\n",
}

Deno.test('Should_FailAnExportOnlyTestsImport_When_ThePanelAgreesAndTheRuleIsCalibrated', async () => {
  const root = await workspace(testOnlyFixture)
  const verdict = await checkCompositionImports(root, await judgeWith('test-only-exports', 0.89))
  assertEquals(verdict._tag, 'Violated')
  assertStringIncludes(
    violations(verdict).join('\n'),
    'export ./vault/laws: judged test-only-exports violated by the panel',
  )
})

Deno.test('Should_OnlyReport_When_TheRulesCalibrationIsBelowTheBarOrStale', async () => {
  const root = await workspace(testOnlyFixture)
  for (const kappa of [0.5, undefined]) {
    const verdict = await checkCompositionImports(root, await judgeWith('test-only-exports', kappa))
    assertEquals(verdict._tag, 'Holds')
    assertStringIncludes(text(verdict), 'export ./vault/laws: judged test-only-exports violated by the panel')
  }
  const stale = makeJudge(await recordedTransport(), DEFAULT_MODELS, {
    'test-only-exports': { kappa: 0.95, cases: 20, fingerprint: 'sha-of-another-rubric' },
  }, shapesOf(await readCases()))
  const verdict = await checkCompositionImports(root, await stale)
  assertEquals(verdict._tag, 'Holds')
  assertStringIncludes(text(verdict), 'calibration is stale')
})

Deno.test('Should_NotFlagAPublishedLeafRoot_When_ThePanelJudgesTheExport', async () => {
  const root = await workspace({
    'packages/leaf/package.json': lib('leaf', { private: false }),
    'packages/leaf/src/index.ts': 'export const x = 1\n',
    'packages/leaf/src/index.test.ts': "import 'leaf'\n",
  })
  const verdict = await checkCompositionImports(root, await judgeWith('test-only-exports', 0.89))
  assertEquals(verdict._tag, 'Holds')
  assert(!text(verdict).includes('violated by the panel'))
})

Deno.test('Should_FailAMirroredLibrary_When_ThePanelAgreesAndTheRuleIsCalibrated_And_KeepARoleLibrary', async () => {
  const mirrored = Object.fromEntries(
    [
      'auth/login',
      'auth/logout',
      'billing/invoices/create',
      'billing/invoices/send',
      'users/profile/avatar',
      'users/profile/name',
    ].map((p) => [`./${p}`, `./src/${p}.ts`]),
  )
  const root = await workspace({
    'packages/mirror/package.json': lib('mirror', { exports: mirrored }),
    'packages/roles/package.json': lib('roles', {
      exports: {
        '.': './src/index.ts',
        './server': './src/server.ts',
        './react': './src/react.tsx',
        './testing': './src/testing.ts',
      },
    }),
  })
  const verdict = await checkCompositionEntries(root, await judgeWith('entries-are-roles', 0.9))
  assertEquals(verdict._tag, 'Violated')
  const found = violations(verdict).join('\n')
  assertStringIncludes(found, 'packages/mirror (mirror): judged entries-are-roles violated by the panel')
  assert(!found.includes('packages/roles'), found)
})

Deno.test('Should_FailGranularityOnlyUnderStrictAndCalibration_When_AnUnpublishedLibraryHasOneDependent', async () => {
  const root = await workspace(singleDependent)
  await commitEach(root, [['packages/shared/src/a.ts', 'packages/only/src/a.ts']])
  const lenient = await checkCompositionGranularity(root, false, await judgeWith('granularity', 0.81))
  assertEquals(lenient._tag, 'Holds')
  assertStringIncludes(text(lenient), 'packages/only (only): judged granularity violated by the panel')
  assertEquals((await checkCompositionGranularity(root, true, await judgeWith('granularity', 0.81)))._tag, 'Violated')
  assertEquals((await checkCompositionGranularity(root, true, await judgeWith('granularity', 0.4)))._tag, 'Holds')
})

Deno.test('Should_OnlyReportGranularity_When_TheUnitKindIsNotDeclared', async () => {
  // Review: tools, CLIs and containers' toolchains with no dependents were judged unused and would have failed --strict.
  // Whether a unit is a library to merge or a tool that is run is its declared kind; until declared, the verdict reports.
  const root = await workspace({
    ...singleDependent,
    'packages/only/package.json': { name: 'only', private: true, dependencies: { shared: 'workspace:*' } },
  })
  await commitEach(root, [['packages/shared/src/a.ts', 'packages/only/src/a.ts']])
  const verdict = await checkCompositionGranularity(root, true, await judgeWith('granularity', 0.81))
  assertEquals(verdict._tag, 'Holds')
  assertStringIncludes(
    text(verdict),
    'packages/only (only): judged granularity violated by the panel (unit kind not declared: reports only)',
  )
})

Deno.test('Should_ReadADockerfileAsADeployConfig_When_ExtractingGranularityEvidence', async () => {
  const root = await workspace({
    'packages/sandbox/package.json': lib('sandbox'),
    'packages/sandbox/Dockerfile': 'FROM scratch\n',
    'packages/sandbox/src/index.ts': 'export const s = 1\n',
  })
  const evidence = (await candidateCases(root)).find((c) => c.rule === 'granularity')!.evidence as {
    deployConfigs: readonly string[]
  }
  assertEquals(evidence.deployConfigs, ['Dockerfile'])
})

// ------------------------------------------------ the calibration set and the extractor

Deno.test('Should_EmitExactlyTheEvidenceShapeTheCalibrationCasesCarry_When_ExtractingFromARealWorkspace', async () => {
  // The calibration cases hold frozen evidence. Nothing may let the extractor drift from what the judge was
  // measured on: the field paths of every rule's evidence from the current extractor equal the cases' union.
  const root = await workspace({
    'packages/a/package.json': lib('a', { exports: { '.': './src/index.ts', './vault/laws': './src/vault/laws.ts' } }),
    'packages/a/src/index.ts': 'export const a = 1\n',
    'packages/a/src/vault/laws.ts': 'export const laws = 1\n',
    'packages/a/tests/vault.integration.test.ts': "import 'a/vault/laws'\nimport 'a'\n",
    'packages/b/package.json': lib('b', {
      exports: { '.': { workerd: './src/worker.ts', node: './src/node.ts' }, './x': './src/x.ts' },
      bin: { b: './bin.ts' },
    }),
    'packages/b/src/node.ts': "import { readFileSync } from 'node:fs'\nexport const b = readFileSync\n",
    'packages/b/src/worker.ts': 'export const b = 1\n',
    'packages/b/src/x.ts': 'export const x = 1\n',
    'apps/web/package.json': app('web', { dependencies: { a: 'workspace:*', b: 'workspace:*' } }),
    'apps/web/src/main.ts': "import 'a'\nimport 'b'\nimport 'b/x'\n",
  })
  await commitEach(root, Array.from({ length: 12 }, () => ['packages/a/f.txt', 'packages/b/f.txt']))
  const emitted = await candidateCases(root)
  const shapes = shapesOf(await readCases())
  for (const rule of JUDGED_RULES) {
    const own = emitted.filter((c) => c.rule === rule)
    assert(own.length > 0, `the fixture emits no ${rule} evidence`)
    assertEquals(shapeOf(own.map((c) => c.evidence)).split('|'), shapes[rule].split('|'), rule)
  }
})
