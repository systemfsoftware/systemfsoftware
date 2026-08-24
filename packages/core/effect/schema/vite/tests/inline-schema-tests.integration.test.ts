/**
 * Generating codec laws for every schema a package exports.
 *
 * Each scenario writes a fixture source tree into a temp directory, then
 * generates that package's law suite and reads the emitted body: which
 * schemas earned a law pair and which module each law binds.
 */
import { Gherkin, Given, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { it, layer } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { parseSync } from 'oxc-parser'
import { afterAll, expect } from 'vitest'

import { generateSchemaLaws, LAW_FILE_BASENAME } from '@systemfsoftware/effect-schema-vite'

const LAW_PKG = '@systemfsoftware/effect-schema-law'

const Feature = makeFeature({ it, layer })
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
  for (const root of [NESTED, NAMESAKES, BARE, BARRELLED, QUOTED, SINGLE]) {
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
        (s) => {
          const lawFileDir = join(s.pkg, 'src')
          const resolved = Object.fromEntries(
            [...lawsIn(s.code)].map(([title, module]) => [
              title,
              existsSync(`${resolve(lawFileDir, module)}.ts`) ? 'imports resolve' : 'imports broken',
            ]),
          )
          expect(resolved).toEqual({
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
      Then('the law binds the nested module by the path leading down to it from the law file')((s) => {
        expect(lawsIn(s.code).get('StructConst')).toBe('./nested/schemas')
      }),
    ),
  )

  scenario(
    'Two modules exporting the same schema name each earn their own law pair on their own module',
    Gherkin.Do.pipe(
      Given('a package where two modules both export a schema named Money')('pkg', () => Effect.succeed(NAMESAKES)),
      When('the plugin generates that package\u2019s law suite')('code', (s) => Effect.sync(() => lawSuiteFor(s.pkg))),
      Then('each namesake is titled by the module that declares it and bound to that module alone')((s) => {
        expect(Object.fromEntries(lawsIn(s.code))).toEqual({
          'Money (./first/money.schema)': './first/money.schema',
          'Money (./second/money.schema)': './second/money.schema',
        })
      }),
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
      Then('the generated suite is syntactically valid')((s) => {
        expect(parseSync(LAW_FILE_BASENAME, s.code).errors).toEqual([])
      }),
      Then('the folder name survives in the title rather than being dropped')((s) => {
        expect(s.code).toContain(String.raw`\'s-money`)
      }),
    ),
  )

  scenario(
    'A package that exports no schemas at all earns an empty law suite',
    Gherkin.Do.pipe(
      Given('a package whose source folder holds no schema at all')('pkg', () => Effect.succeed(BARE)),
      When('the plugin generates that package’s law suite')('code', (s) => Effect.sync(() => lawSuiteFor(s.pkg))),
      Then('the law suite is an empty module')((s) => {
        expect(s.code).toBe('// no schemas found\nexport {}\n')
      }),
    ),
  )

  scenario(
    'The generated suite contains only round-trip laws',
    Gherkin.Do.pipe(
      Given('a package with a single schema')('pkg', () => Effect.succeed(SINGLE)),
      When('the plugin generates that package’s law suite')('code', (s) => Effect.sync(() => lawSuiteFor(s.pkg))),
      Then('the suite contains ruleOfSchemas calls')((s) => {
        expect(s.code).toContain('ruleOfSchemas')
      }),
      Then('the suite names no refutation symbol and no refutation entry')((s) => {
        expect(s.code).not.toContain('obligationsOf')
        expect(s.code).not.toContain('REFUTED')
        expect(s.code).not.toContain('EXPORTED')
        expect(s.code).not.toContain('effect/SchemaAST')
        expect(s.code).not.toContain('/refutation')
      }),
      Then('the suite imports ruleOfSchemas from the law package alone')((s) => {
        expect(s.code).toContain(`from '${LAW_PKG}'`)
      }),
      Then('the suite needs no vitest import')((s) => {
        expect(s.code).not.toContain(`from 'vitest'`)
      }),
    ),
  )
})
