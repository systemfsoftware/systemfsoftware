/**
 * Generating codec laws for every schema a package exports.
 *
 * Each scenario writes a fixture source tree into a temp directory, then
 * generates that package's law suite and reads the emitted body: which
 * schemas earned a law pair and which module each law binds.
 */
import { Gherkin, Given, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { it } from '@systemfsoftware/effect-gherkin-spec'
import { afterAll } from '@systemfsoftware/vitest'
import { Effect } from 'effect'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseSync } from 'oxc-parser'
import { createServer } from 'vite'

import { RECURSION_BUDGET_RUNTIME_SPECIFIER } from '@systemfsoftware/effect-schema-recursion-budget'
import { generateSchemaLaws, inlineSchemaTests, LAW_FILE_BASENAME } from '@systemfsoftware/effect-schema-vite'

const LAW_PKG = '@systemfsoftware/effect-schema-law'

const Feature = makeFeature({ it })
const MIXED_DECLARATIONS = [
  `export const StructConst = Schema.Struct({ x: Schema.String })`,
  `export const PipedFromMember = S.String.pipe(S.pattern(/x/))`,
  `export const PipedFromCall = Schema.Struct({ x: Schema.String }).pipe(Schema.filter(ok))`,
  `export class DataClass extends Schema.Class<DataClass>('DataClass')({ x: Schema.String }) {}`,
  `export class TaggedData extends S.TaggedClass<TaggedData>()('TaggedData', {}) {}`,
  `export class Boom extends S.TaggedError<Boom>()('Boom', { cause: S.Unknown }) {}`,
  `export class Unrelated extends Array {}`,
  `const Unexported = Schema.Struct({ x: Schema.String })`,
].join('\n')

const MONEY = `export const Money = S.String.pipe(S.brand('Money'))\n`

const makePackage = (prefix: string, files: Record<string, string>): string => {
  const root = mkdtempSync(join(tmpdir(), prefix))
  mkdirSync(join(root, 'src'), { recursive: true })
  for (const [relativePath, contents] of Object.entries(files)) {
    const full = join(root, 'src', relativePath)
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, contents)
  }
  return root
}

const lawSuiteFor = (root: string): string =>
  generateSchemaLaws(join(root, 'src', LAW_FILE_BASENAME), join(root, 'src'))

/**
 * Title of every emitted law pair, mapped to the module specifier its bound
 * schema is imported from. Two schemas sharing a name must appear as two
 * entries binding two modules — collapsing to one entry is the namesake bug.
 */
const lawsIn = (code: string): ReadonlyMap<string, string> => {
  const moduleOfLocal = new Map(
    [...code.matchAll(/import \{ \w+ as (\w+) \} from '([^']+)'/g)].map(([, local, module]) => [
      local ?? '',
      module ?? '',
    ]),
  )
  return new Map(
    [...code.matchAll(/ruleOfSchemas\('([^']+)', (\w+)\)/g)].map(([, title, local]) => [
      title ?? '',
      moduleOfLocal.get(local ?? '') ?? '',
    ]),
  )
}

const NESTED = makePackage('schema-laws-', { 'nested/schemas.ts': MIXED_DECLARATIONS })

const NESTED_LAW_BINDINGS = {
  StructConst: './nested/schemas',
  PipedFromMember: './nested/schemas',
  PipedFromCall: './nested/schemas',
  DataClass: './nested/schemas',
  TaggedData: './nested/schemas',
}

const recursionLawsIn = (code: string): ReadonlyMap<string, string> => {
  const moduleOfLocal = new Map(
    [...code.matchAll(/import \{ \w+ as (\w+) \} from '([^']+)'/g)].map(([, local, module]) => [
      local ?? '',
      module ?? '',
    ]),
  )
  return new Map(
    [...code.matchAll(/recursionLaws\('([^']+)', (\w+)\)/g)].map(([, title, local]) => [
      title ?? '',
      moduleOfLocal.get(local ?? '') ?? '',
    ]),
  )
}

/**
 * The title literals the suite hands `ruleOfSchemas`, apostrophes and all: the plain capture stops at an
 * escaped quote, so it drops the pair a folder named `pat's-money` earns. Sorted, because the walk order of
 * the two schema files is not part of the contract.
 */
const titlesIn = (code: string): ReadonlyArray<string> =>
  [...code.matchAll(/ruleOfSchemas\('((?:[^'\\]|\\.)*)', /g)].map(([, title]) => title ?? '').sort()

/** The law calls the suite declares, in the order it declares them. */
const callsIn = (code: string): ReadonlyArray<string> =>
  [...code.matchAll(/\b(ruleOfSchemas|recursionLaws)\(/g)].map(([, called]) => called ?? '')

/** The module specifiers the suite imports, in the order it imports them. */
const importsIn = (code: string): ReadonlyArray<string> =>
  [...code.matchAll(/from '([^']+)'/g)].map(([, specifier]) => specifier ?? '')

/** The budget-hook call the transform spliced in, with the formatter's whitespace collapsed. */
const hookCallIn = (code: string): string | undefined =>
  /toCodecArbitrary: __esRecursionBudget\(\(\) => RecursiveExpr, \{[\s\S]*?\}\)/.exec(code)?.[0]?.replace(/\s+/g, ' ')

/** The specifier of the import that binds the injected budget-hook alias. */
const hookImportSpecifierIn = (code: string): string | undefined =>
  /import \{ budgetToArbitrary as __esRecursionBudget \} from "([^"]+)";/.exec(code)?.[1]

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const drivenByPlugin = async (
  root: string,
): Promise<{ readonly code: string; readonly runtime: string | null; readonly exportedSchemas: readonly string[] }> => {
  const server = await createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true },
    plugins: [inlineSchemaTests()],
  })
  try {
    const transformed = await server.transformRequest('/src/recursive.schema.ts')
    const resolved = await server.pluginContainer.resolveId(RECURSION_BUDGET_RUNTIME_SPECIFIER)
    const loaded = await server.ssrLoadModule('/src/recursive.schema.ts')
    return {
      code: transformed?.code ?? '',
      runtime: resolved?.id ?? null,
      exportedSchemas: Object.keys(loaded),
    }
  } finally {
    await server.close()
  }
}

const RECURSIVE_SCHEMA = `
import { Schema } from 'effect'

type Codec = Schema.Codec<unknown, unknown>

const Lit = Schema.TaggedStruct('Lit', { value: Schema.Finite })
const Id = Schema.TaggedStruct('Id', { name: Schema.String })

export const RecursiveExpr: Codec = Schema.suspend(
  (): Codec =>
    Schema.Union([
      Lit,
      Id,
      Schema.Struct({ _tag: Schema.Literal('Binary'), left: RecursiveExpr, right: RecursiveExpr }),
      Schema.Struct({ _tag: Schema.Literal('Member'), object: RecursiveExpr, property: RecursiveExpr }),
      Schema.Struct({
        _tag: Schema.Literal('Conditional'),
        test: RecursiveExpr,
        consequent: RecursiveExpr,
        alternate: RecursiveExpr
      }),
      Schema.Struct({ _tag: Schema.Literal('Call'), callee: RecursiveExpr, args: Schema.Array(RecursiveExpr) })
    ])
).annotate({
  identifier: 'RecursiveExpr',
  recursionBudget: { maxDepth: 6, depthSize: 'medium' }
})
`

const makeRuntimePackage = (files: Record<string, string>): string => {
  const tempRoot = join(PACKAGE_ROOT, 'temp')
  mkdirSync(tempRoot, { recursive: true })
  const root = mkdtempSync(join(tempRoot, 'law-suite-'))
  mkdirSync(join(root, 'src'), { recursive: true })
  for (const [relativePath, contents] of Object.entries(files)) {
    writeFileSync(join(root, 'src', relativePath), contents)
  }
  writeFileSync(join(root, 'src', LAW_FILE_BASENAME), 'export {}\n')
  return root
}

const RECURSIVE_RUNTIME = makeRuntimePackage({ 'recursive.schema.ts': RECURSIVE_SCHEMA })

const NAMESAKES = makePackage('schema-laws-namesake-', {
  'first/money.schema.ts': MONEY,
  'second/money.schema.ts': MONEY,
})

const BARE = makePackage('schema-laws-empty-', { 'helpers.ts': `export const ok = (x: string) => x.length > 0\n` })

const BARRELLED = makePackage('schema-laws-barrel-', {
  'money/money.schema.ts': MONEY,
  'money/index.ts': `export { Money } from './money.schema.js'\n`,
})
const QUOTED = makePackage('schema-laws-quote-', {
  "pat's-money/money.schema.ts": MONEY,
  'plain-money/money.schema.ts': MONEY,
})

const SINGLE = makePackage('schema-laws-single-', {
  'money.schema.ts': MONEY,
})

afterAll(() => {
  for (const root of [NESTED, NAMESAKES, BARE, BARRELLED, QUOTED, SINGLE, RECURSIVE_RUNTIME]) {
    rmSync(root, { recursive: true, force: true })
  }
})
Feature('Generating codec laws for every schema a package exports').body(({ scenario }) => {
  scenario(
    'A package of five data schemas and one tagged error earns a law pair per data schema and none for the error',
    Gherkin.Do.pipe(
      Given('a package declaring five data schemas, a tagged error, an unrelated class, and an unexported schema')(
        'pkg',
        () => Effect.succeed(NESTED),
      ),
      When('the plugin generates that package\u2019s law suite')('code', (s) => Effect.sync(() => lawSuiteFor(s.pkg))),
      Then('the five data schemas each carry a law pair bound to a module that exists, and the error carries none')(
        (s, expect) => {
          const lawFileDir = join(s.pkg, 'src')
          const resolved = Object.fromEntries(
            [...lawsIn(s.code)].map(([title, module]) => [
              title,
              existsSync(`${resolve(lawFileDir, module)}.ts`) ? 'imports resolve' : 'imports broken',
            ]),
          )
          return expect(resolved).toEqual({
            StructConst: 'imports resolve',
            PipedFromMember: 'imports resolve',
            PipedFromCall: 'imports resolve',
            DataClass: 'imports resolve',
            TaggedData: 'imports resolve',
          })
        },
      ),
    ),
  )

  scenario(
    'Schemas kept in a nested folder are bound by a path relative to the law file, not to the package root',
    Gherkin.Do.pipe(
      Given('a package whose schemas all live one folder below its source root')('pkg', () => Effect.succeed(NESTED)),
      When('the plugin generates that package\u2019s law suite')('code', (s) => Effect.sync(() => lawSuiteFor(s.pkg))),
      Then('the law binds the nested module by the path leading down to it from the law file')((s, expect) =>
        expect(lawsIn(s.code).get('StructConst')).toBe('./nested/schemas')
      ),
    ),
  )

  scenario(
    'Two modules exporting the same schema name each earn their own law pair on their own module',
    Gherkin.Do.pipe(
      Given('a package where two modules both export a schema named Money')('pkg', () => Effect.succeed(NAMESAKES)),
      When('the plugin generates that package\u2019s law suite')('code', (s) => Effect.sync(() => lawSuiteFor(s.pkg))),
      Then('each namesake is titled by the module that declares it and bound to that module alone')((s, expect) =>
        expect(Object.fromEntries(lawsIn(s.code))).toEqual({
          'Money (./first/money.schema)': './first/money.schema',
          'Money (./second/money.schema)': './second/money.schema',
        })
      ),
    ),
  )

  scenario(
    'A schema kept in a folder whose name carries an apostrophe still yields a suite that parses',
    Gherkin.Do.pipe(
      Given('a package where one of two namesake schemas sits in a folder named after Pat\u2019s money')(
        'pkg',
        () => Effect.succeed(QUOTED),
      ),
      When('the plugin generates that package\u2019s law suite')('code', (s) => Effect.sync(() => lawSuiteFor(s.pkg))),
      Then('the generated suite parses and its title keeps the apostrophe in the folder name')((s, expect) =>
        expect({ parseErrors: parseSync(LAW_FILE_BASENAME, s.code).errors, titles: titlesIn(s.code) }).toEqual({
          parseErrors: [],
          titles: [String.raw`Money (./pat\'s-money/money.schema)`, 'Money (./plain-money/money.schema)'],
        })
      ),
    ),
  )

  scenario(
    'A package that exports no schemas at all earns an empty law suite',
    Gherkin.Do.pipe(
      Given('a package whose source folder holds no schema at all')('pkg', () => Effect.succeed(BARE)),
      When('the plugin generates that package’s law suite')('code', (s) => Effect.sync(() => lawSuiteFor(s.pkg))),
      Then('the law suite is an empty module')((s, expect) => expect(s.code).toBe('// no schemas found\nexport {}\n')),
    ),
  )

  scenario(
    'The generated suite carries a law call for round-trips and one for generation',
    Gherkin.Do.pipe(
      Given('a package with a single schema')('pkg', () => Effect.succeed(SINGLE)),
      When('the plugin generates that package’s law suite')('code', (s) => Effect.sync(() => lawSuiteFor(s.pkg))),
      Then('the suite calls both law kinds, importing them from the law package and nothing from vitest')((s, expect) =>
        expect({ calls: callsIn(s.code), imports: importsIn(s.code) }).toEqual({
          calls: ['ruleOfSchemas', 'recursionLaws'],
          imports: [LAW_PKG, './money.schema'],
        })
      ),
    ),
  )

  scenario(
    'Every exported schema earns a generation-law call beside its round-trip pair',
    Gherkin.Do.pipe(
      Given('a package whose schemas all live one folder below its source root')('pkg', () => Effect.succeed(NESTED)),
      When('the plugin generates that package’s law suite')('code', (s) => Effect.sync(() => lawSuiteFor(s.pkg))),
      Then('each schema is passed to both law calls under one title and one module binding')((s, expect) =>
        expect({
          roundTrips: Object.fromEntries(lawsIn(s.code)),
          generation: Object.fromEntries(recursionLawsIn(s.code)),
        }).toEqual({ roundTrips: NESTED_LAW_BINDINGS, generation: NESTED_LAW_BINDINGS })
      ),
    ),
  )

  scenario(
    'Registering the one plugin materializes a declared generation budget, not only the laws',
    { live: 'the plugin is driven through a real Vite development server over real files on disk' },
    Gherkin.Do.pipe(
      Given('a package whose recursive schema declares its generation budget')(
        'pkg',
        () => Effect.succeed(RECURSIVE_RUNTIME),
      ),
      When('that plugin drives the schema module through Vite')(
        'driven',
        (s) => Effect.promise(() => drivenByPlugin(s.pkg)),
      ),
      Then('the plugin honors the budget, resolving its hook on disk and exporting the schema')((s, expect) =>
        expect({
          hookCall: hookCallIn(s.driven.code),
          hookImportSpecifier: hookImportSpecifierIn(s.driven.code),
          runtime: s.driven.runtime,
          runtimeContents: readFileSync(s.driven.runtime ?? '', 'utf8'),
          exportedSchemas: s.driven.exportedSchemas,
        }).toMatchObject({
          hookCall: 'toCodecArbitrary: __esRecursionBudget(() => RecursiveExpr, { maxDepth: 6, depthSize: "medium" })',
          hookImportSpecifier: expect.stringMatching(/recursion-budget-runtime\.[a-z]+$/),
          runtime: expect.stringMatching(/recursion-budget-runtime\.(ts|mjs)$/),
          runtimeContents: expect.stringMatching(/export const budgetToArbitrary/),
          exportedSchemas: ['RecursiveExpr'],
        })
      ),
    ),
  )
})
