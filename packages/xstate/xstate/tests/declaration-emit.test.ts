import { it } from '@systemfsoftware/vitest'
import { Effect } from 'effect'
import { execFile } from 'node:child_process'
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'

const packageDir = path.resolve(import.meta.dirname, '..')
const fixtureDir = 'tests/fixtures/declarations'
const typescript = createRequire(import.meta.url).resolve('typescript/package.json')
const tsc = path.join(path.dirname(typescript), 'bin/tsc')

const FIXTURES = ['narrowed-context', 'strict-targets', 'registered-child-parent', 'created-invoke'] as const

const COMPILER_FLAGS = [
  '--ignoreConfig',
  '--strict',
  '--skipLibCheck',
  '--allowImportingTsExtensions',
  '--preserveSymlinks',
  '--target',
  'esnext',
  '--module',
  'nodenext',
  '--moduleResolution',
  'nodenext',
  '--types',
  '',
]

type Compiled = { readonly diagnostics: readonly string[] }

const compile = (cwd: string, args: readonly string[]) =>
  Effect.callback<Compiled>((resume) => {
    execFile(process.execPath, [tsc, ...COMPILER_FLAGS, ...args], { cwd, maxBuffer: 64 * 1024 * 1024 }, (_, stdout) => {
      resume(
        Effect.succeed({ diagnostics: stdout.split('\n').filter((line) => /^\S.*\(\d+,\d+\): error TS/.test(line)) }),
      )
    })
  })

const diagnosticsOf = (compiled: Compiled, file: string) =>
  compiled.diagnostics.filter((line) => line.startsWith(`${fixtureDir}/${file}.ts(`))

const manyInvokedStates = (count: number) => {
  const eventKeys = Array.from({ length: count * 8 }, (_, i) => `e${i}`)
  const states = Array.from(
    { length: count },
    (_, i) =>
      `const p${i} = parentSetup.createStateConfig({
  invoke: { src: 'child', input: ({ context }) => ({ token: context.token }) },
  on: { ${eventKeys.slice(i * 8, (i + 1) * 8).map((key) => `${key}: { target: 'p${(i + 1) % count}' }`).join(',')} }
});`,
  )
  return `import { setup, types } from '../../../src/index.ts';
import { childMachine } from './registered-child.ts';

const parentSetup = setup({
  schemas: {
    context: types<{ token: string }>(),
    events: { ${eventKeys.map((key) => `${key}: types<{ value: string }>()`).join(',')} }
  },
  actors: { child: childMachine }
});

${states.join('\n')}

export const parentMachine = parentSetup.createMachine({
  context: { token: '' },
  initial: 'p0',
  states: { ${Array.from({ length: count }, (_, i) => `p${i}`).join(',')} }
});
`
}

/** Every type name an emitted declaration imports from the package's sources. */
const referencedNames = (declaration: string): readonly string[] => [
  ...new Set([
    ...[...declaration.matchAll(/import\("[^"]*\/src\/[^"]+"\)\.(\w+)/g)].map((match) => match[1]!),
    ...[...declaration.matchAll(/import\s*(?:type\s*)?\{([^}]+)\}\s*from\s*"[^"]*\/src\/[^"]+"/g)]
      .flatMap((match) => match[1]!.split(','))
      .map((entry) => entry.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0]!)
      .filter((name) => name.length > 0),
  ]),
]

const emitWorkspace = Effect.acquireRelease(
  Effect.promise(async () => {
    const cacheDir = path.join(packageDir, 'node_modules/.cache')
    await mkdir(cacheDir, { recursive: true })
    const root = await mkdtemp(path.join(cacheDir, 'declaration-emit-'))
    await symlink(path.join(packageDir, 'src'), path.join(root, 'src'))
    await cp(path.join(packageDir, fixtureDir), path.join(root, fixtureDir), { recursive: true })
    await writeFile(path.join(root, fixtureDir, 'many-invoked-states.ts'), manyInvokedStates(30))
    return root
  }),
  (root) => Effect.promise(() => rm(root, { recursive: true, force: true })),
)

const emitted = (root: string, file: string) =>
  Effect.promise(() => readFile(path.join(root, 'dts', fixtureDir, `${file}.d.ts`), 'utf8').catch(() => ''))

it('Should_EmitEveryFixtureDeclarationWithoutDiagnostics_When_TypeScript7CompilesThem', function*({ expect }) {
  const root = yield* emitWorkspace
  const sources = [...FIXTURES, 'many-invoked-states', 'created-invoke-inference'].map((file) =>
    `${fixtureDir}/${file}.ts`
  )
  const compiled = yield* compile(root, [
    '--declaration',
    '--emitDeclarationOnly',
    '--rootDir',
    '.',
    '--outDir',
    'dts',
    ...sources,
    'src/index.ts',
  ])
  const declarations = yield* Effect.forEach(FIXTURES, (file) => emitted(root, file))
  const parent = yield* emitted(root, 'registered-child-parent')
  const many = yield* emitted(root, 'many-invoked-states')
  yield* expect({
    diagnostics: Object.fromEntries(
      [...FIXTURES, 'many-invoked-states', 'created-invoke-inference'].map((file) => [
        file,
        diagnosticsOf(compiled, file),
      ]),
    ),
    emitted: Object.fromEntries(FIXTURES.map((file, index) => [file, declarations[index]!.length > 0])),
    parentUnderBudget: Buffer.byteLength(parent) < 500_000,
    parentC0Members: parent.match(/readonly c0: \{/g)?.length ?? 0,
    manyUnderBudget: many.length > 0 && Buffer.byteLength(many) < 100_000,
    manyP0Members: many.match(/readonly p0: \{/g)?.length ?? 0,
  }).toEqual({
    diagnostics: {
      'narrowed-context': [],
      'strict-targets': [],
      'registered-child-parent': [],
      'created-invoke': [],
      'many-invoked-states': [],
      'created-invoke-inference': [],
    },
    emitted: {
      'narrowed-context': true,
      'strict-targets': true,
      'registered-child-parent': true,
      'created-invoke': true,
    },
    parentUnderBudget: true,
    parentC0Members: 1,
    manyUnderBudget: true,
    manyP0Members: 1,
  })
})

it('Should_NameOnlyEntryPointExports_When_ADeclarationReachesIntoTheSources', function*({ expect }) {
  const root = yield* emitWorkspace
  yield* compile(root, [
    '--declaration',
    '--emitDeclarationOnly',
    '--rootDir',
    '.',
    '--outDir',
    'dts',
    ...FIXTURES.map((file) => `${fixtureDir}/${file}.ts`),
    'src/index.ts',
  ])
  const declarations = yield* Effect.forEach(FIXTURES, (file) => emitted(root, file))
  const names = [...new Set(declarations.flatMap(referencedNames))].toSorted()
  const probe = path.join(root, fixtureDir, 'entry-point-names.ts')
  yield* Effect.promise(() =>
    writeFile(
      probe,
      `import type {\n${names.map((name) => `  ${name},`).join('\n')}\n} from '../../../src/index.ts'\n`,
    )
  )
  const compiled = yield* compile(root, ['--noEmit', `${fixtureDir}/entry-point-names.ts`])
  yield* expect({ named: names.length > 0, missing: diagnosticsOf(compiled, 'entry-point-names') }).toEqual({
    named: true,
    missing: [],
  })
})

it('Should_CompileTheConsumer_When_ItSeesOnlyTheEmittedParentDeclaration', function*({ expect }) {
  const root = yield* emitWorkspace
  yield* compile(root, [
    '--declaration',
    '--emitDeclarationOnly',
    '--rootDir',
    '.',
    '--outDir',
    'dts',
    `${fixtureDir}/registered-child-parent.ts`,
    'src/index.ts',
  ])
  const parentSource = path.join(root, fixtureDir, 'registered-child-parent.ts')
  const parentDeclaration = path.join(root, 'dts', fixtureDir, 'registered-child-parent.d.ts')
  yield* Effect.promise(() => cp(parentDeclaration, path.join(root, fixtureDir, 'registered-child-parent.d.ts')))
  yield* Effect.promise(() => rm(parentSource))
  const compiled = yield* compile(root, ['--noEmit', `${fixtureDir}/registered-child-consumer.ts`])
  yield* expect({
    seesSource: compiled.diagnostics.some((line) => line.includes('registered-child-parent.ts(')),
    diagnostics: diagnosticsOf(compiled, 'registered-child-consumer'),
  }).toEqual({ seesSource: false, diagnostics: [] })
})
