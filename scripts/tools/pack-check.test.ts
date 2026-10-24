import { assertEquals, assertStringIncludes } from '@std/assert'
import { dirname, fromFileUrl, join } from '@std/path'
import { type Finding, judge, type Judgement, type Rules } from './pack-check.ts'

const here = dirname(fromFileUrl(import.meta.url))

// The built-in names the shell takes from `node:module`; a fixed list keeps the judge's oracle outside the tool.
const BUILTINS: ReadonlySet<string> = new Set(['fs', 'path', 'os', 'module'])

const NONE: Rules = { forbid: [], requireExport: [], requireLiteral: [] }

// The bans and requirements a run against the core package passes (AC-7.4 and the report-1 schema).
const CORE: Rules = {
  forbid: ['node:*', 'playwright', 'playwright-core', '@playwright/*', 'undici'],
  requireExport: [{ subpath: './report', value: 'report1JsonSchema' }],
  requireLiteral: [{ subpath: './report', value: 'report-1' }],
}

const encode = (text: string) => new TextEncoder().encode(text)

const filesFrom = (manifest: unknown, modules: Readonly<Record<string, string>>): Map<string, Uint8Array> =>
  new Map([
    ['package.json', encode(JSON.stringify(manifest))],
    ...Object.entries(modules).map(([path, text]): [string, Uint8Array] => [path, encode(text)]),
  ])

const coreManifest = {
  name: '@scope/core',
  exports: {
    '.': { types: './dist/index.d.ts', default: './dist/index.mjs' },
    './report': { types: './dist/report.d.ts', default: './dist/report.mjs' },
    './package.json': './package.json',
  },
}

// A tsdown-shaped core: the report entry re-exports a binding whose schema literal lives in a chunk.
const coreModules = {
  'dist/index.d.ts': 'export {}',
  'dist/index.mjs':
    `import * as Effect from "effect/Effect";\nimport * as HttpClient from "effect/http/HttpClient";\n` +
    `import { sha256 } from "@noble/hashes/sha2";\nexport const ok = 1;`,
  'dist/report.d.ts': 'export {}',
  'dist/report.mjs':
    `import { s as Report1 } from "./report.schema-C1.mjs";\nimport * as Schema from "effect/Schema";\n` +
    `const report1JsonSchema = () => Schema.toJsonSchemaDocument(Report1);\nexport { report1JsonSchema };`,
  'dist/report.schema-C1.mjs': `import * as Schema from "effect/Schema";\n` +
    `const Report1 = Schema.Struct({ schema: Schema.Literal("report-1") });\nexport { Report1 as s };`,
}

const findings = (judgement: Judgement): readonly Finding[] => {
  if (judgement.kind === 'refused') throw new Error(`refused: ${judgement.reason}`)
  return judgement.findings
}

Deno.test('a core-shaped tarball under the core rules has no findings', async () => {
  assertEquals(findings(await judge(filesFrom(coreManifest, coreModules), CORE, BUILTINS)), [])
})

Deno.test('a tarball without dist is DistMissing, and its exports targets are missing too', async () => {
  const got = findings(await judge(filesFrom(coreManifest, {}), NONE, BUILTINS))
  assertEquals(got[0], { _tag: 'DistMissing' })
  assertEquals(got.filter((finding) => finding._tag === 'TargetMissing').length, 4)
})

Deno.test('an exports target the tarball does not hold is TargetMissing naming the subpath', async () => {
  const { 'dist/report.mjs': _, ...rest } = coreModules
  const got = findings(await judge(filesFrom(coreManifest, rest), NONE, BUILTINS))
  assertEquals(got, [{ _tag: 'TargetMissing', entry: './report', path: './dist/report.mjs' }])
})

Deno.test('a bin target the tarball does not hold is TargetMissing naming the bin', async () => {
  const manifest = { exports: { './package.json': './package.json' }, bin: { 'effect-e2e': './dist/bin.mjs' } }
  const got = findings(await judge(filesFrom(manifest, { 'dist/other.mjs': '' }), NONE, BUILTINS))
  assertEquals(got, [{ _tag: 'TargetMissing', entry: 'bin effect-e2e', path: './dist/bin.mjs' }])
})

Deno.test('static, bare and dynamic Node built-in imports are each ForbiddenImport', async () => {
  const modules = {
    ...coreModules,
    'dist/index.mjs': `import { readFile } from "node:fs";\nimport "fs";\nconst p = await import("node:path");`,
  }
  const got = findings(await judge(filesFrom(coreManifest, modules), CORE, BUILTINS))
  assertEquals(got.map((finding) => finding._tag === 'ForbiddenImport' && finding.specifier), [
    'node:fs',
    'fs',
    'node:path',
  ])
})

Deno.test('Playwright imports are forbidden by package and by scope even when the manifest declares a peer', async () => {
  const manifest = { ...coreManifest, peerDependencies: { playwright: '^1' } }
  const modules = {
    ...coreModules,
    'dist/index.mjs': `import { chromium } from "playwright";\nimport "playwright-core/lib/server";\n` +
      `import { test } from "@playwright/test";`,
  }
  const got = findings(await judge(filesFrom(manifest, modules), CORE, BUILTINS))
  assertEquals(got.map((finding) => finding._tag === 'ForbiddenImport' && finding.pattern), [
    'playwright',
    'playwright-core',
    '@playwright/*',
  ])
})

Deno.test('an HTTP-client implementation is forbidden while the effect HttpClient service is not', async () => {
  const modules = {
    ...coreModules,
    'dist/index.mjs': `import { request } from "undici";\nimport * as HttpClient from "effect/http/HttpClient";`,
  }
  const got = findings(await judge(filesFrom(coreManifest, modules), CORE, BUILTINS))
  assertEquals(got, [{ _tag: 'ForbiddenImport', file: 'dist/index.mjs', specifier: 'undici', pattern: 'undici' }])
})

Deno.test('a run that forbids nothing accepts Node built-ins', async () => {
  const manifest = { bin: { cli: './dist/bin.mjs' }, engines: { node: '>=24' } }
  const got = findings(
    await judge(filesFrom(manifest, { 'dist/bin.mjs': `import os from "node:os";` }), NONE, BUILTINS),
  )
  assertEquals(got, [])
})

Deno.test('import text inside a string and import.meta are not imports', async () => {
  const modules = {
    ...coreModules,
    'dist/index.mjs':
      `const template = "import x from 'node:os'";\nconst url = import.meta.url;\nexport { template, url };`,
  }
  assertEquals(findings(await judge(filesFrom(coreManifest, modules), CORE, BUILTINS)), [])
})

Deno.test('a report entry that does not export the declared binding is RequiredExportMissing', async () => {
  const modules = {
    ...coreModules,
    'dist/report.mjs': coreModules['dist/report.mjs'].replace('{ report1JsonSchema }', '{}'),
  }
  const got = findings(await judge(filesFrom(coreManifest, modules), CORE, BUILTINS))
  assertEquals(got, [{
    _tag: 'RequiredExportMissing',
    subpath: './report',
    file: 'dist/report.mjs',
    name: 'report1JsonSchema',
  }])
})

Deno.test('a schema literal absent from the entry and every chunk it imports is RequiredLiteralMissing', async () => {
  const modules = {
    ...coreModules,
    'dist/report.schema-C1.mjs': coreModules['dist/report.schema-C1.mjs'].replace('report-1', 'report-2'),
    // An unimported module holding the literal does not count.
    'dist/stray.mjs': `export const tag = "report-1";`,
  }
  const got = findings(await judge(filesFrom(coreManifest, modules), CORE, BUILTINS))
  assertEquals(got, [{
    _tag: 'RequiredLiteralMissing',
    subpath: './report',
    file: 'dist/report.mjs',
    text: 'report-1',
  }])
})

Deno.test('a tarball without package/package.json is refused, not judged', async () => {
  const judgement = await judge(new Map([['dist/index.mjs', encode('')]]), NONE, BUILTINS)
  assertEquals(judgement.kind, 'refused')
})

// Packs a real package directory with pnpm and runs the published command against the tarball.
const packCheck = async (modules: Readonly<Record<string, string>>, args: readonly string[]) => {
  const dir = await Deno.makeTempDir()
  await Deno.writeTextFile(
    join(dir, 'package.json'),
    JSON.stringify({ name: 'fixture', version: '1.0.0', files: ['dist'], exports: { '.': './dist/index.mjs' } }),
  )
  await Deno.mkdir(join(dir, 'dist'))
  for (const [path, text] of Object.entries(modules)) await Deno.writeTextFile(join(dir, path), text)
  const out = await new Deno.Command(Deno.execPath(), {
    args: [
      'run',
      `--config=${join(here, '..', 'deno.jsonc')}`,
      `--lock=${join(here, '..', 'deno.lock')}`,
      '--frozen',
      '--allow-read',
      '--allow-write',
      '--allow-run=pnpm',
      join(here, 'pack-check.ts'),
      '--package-directory',
      dir,
      ...args,
    ],
    stdout: 'piped',
    stderr: 'piped',
  }).output()
  await Deno.remove(dir, { recursive: true })
  const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes)
  return { code: out.code, stdout: decode(out.stdout), stderr: decode(out.stderr) }
}

Deno.test('the command packs a package and exits 1 naming a forbidden import in its tarball', async () => {
  const run = await packCheck({ 'dist/index.mjs': `import { readFile } from "node:fs";` }, ['--forbid', 'node:*'])
  assertEquals(run.code, 1, run.stderr)
  assertStringIncludes(run.stdout, 'fixture-1.0.0.tgz: ForbiddenImport: dist/index.mjs imports node:fs')
})

Deno.test('the command exits 0 on a tarball that breaks no rule', async () => {
  const run = await packCheck({ 'dist/index.mjs': `export const ok = 1;` }, ['--forbid', 'node:*'])
  assertEquals(run.code, 0, run.stderr)
  assertStringIncludes(run.stdout, 'fixture-1.0.0.tgz: no findings')
})

Deno.test('a requirement without = is refused before anything is packed', async () => {
  const run = await packCheck({ 'dist/index.mjs': '' }, ['--require-export', './report'])
  assertEquals(run.code, 1)
  assertStringIncludes(run.stderr, 'expected <subpath>=<value>')
})
