/**
 * Generating codec laws for every schema a package exports.
 *
 * Each scenario writes a fixture source tree into a temp directory, then
 * generates that package's law suite and reads the emitted body: which
 * schemas earned a law pair, which module each law binds, and which
 * refusals discharge which schema.
 */
import { Gherkin, Given, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { it, layer } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { afterAll, expect } from 'vitest'

import { generateSchemaLaws, LAW_FILE_BASENAME } from '../src/mod.js'

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
  'second/money.schema.property.test.ts': [
    `import { refutes } from '@systemfsoftware/effect-schema-law'`,
    `import { Money } from './money.schema.js'`,
    `refutes(Money, {})`,
  ].join('\n'),
})

const BARE = makePackage('schema-laws-empty-', {})

afterAll(() => {
  for (const root of [NESTED, NAMESAKES, BARE]) rmSync(root, { recursive: true, force: true })
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
    'A refusal stated against one module leaves its namesake in another module undischarged',
    Gherkin.Do.pipe(
      Given('a package where two modules both export a schema named Money and only the second states a refusal')(
        'pkg',
        () => Effect.succeed(NAMESAKES),
      ),
      When('the plugin generates that package\u2019s law suite')('code', (s) => Effect.sync(() => lawSuiteFor(s.pkg))),
      Then('only the schema the refusal was stated against counts as refuted')((s) => {
        expect(/new Set\(\[([^\]]*)\]\)/.exec(s.code)?.[1]).toBe(`'Money (./second/money.schema)'`)
      }),
    ),
  )

  scenario(
    'A package addressed by a path relative to the working directory keeps the refusals it stated',
    Gherkin.Do.pipe(
      Given('a package reached by a relative path, whose second Money alone states a refusal')(
        'pkg',
        () => Effect.succeed(relative(process.cwd(), NAMESAKES)),
      ),
      When('the plugin generates that package\u2019s law suite')('code', (s) => Effect.sync(() => lawSuiteFor(s.pkg))),
      Then('the refusal still discharges the schema it was stated against')((s) => {
        expect(/new Set\(\[([^\]]*)\]\)/.exec(s.code)?.[1]).toBe(`'Money (./second/money.schema)'`)
      }),
    ),
  )

  scenario(
    'A package that exports no schemas at all earns an empty law suite',
    Gherkin.Do.pipe(
      Given('a package with an empty source folder')('pkg', () => Effect.succeed(BARE)),
      When('the plugin generates that package\u2019s law suite')('code', (s) => Effect.sync(() => lawSuiteFor(s.pkg))),
      Then('the law suite is an empty module')((s) => {
        expect(s.code).toBe('// no schemas found\nexport {}\n')
      }),
    ),
  )
})
