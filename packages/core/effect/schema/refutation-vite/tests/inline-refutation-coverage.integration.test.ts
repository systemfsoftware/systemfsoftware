/**
 * Generating obligation-coverage for every schema a package exports.
 *
 * Each scenario writes a fixture source tree into a temp directory, then
 * generates that package's refutation suite and reads the emitted body:
 * which schemas were discovered, which refusals discharge which schema,
 * and whether the coverage assertion would pass.
 */
import { Gherkin, Given, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { it, layer } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { parseSync } from 'oxc-parser'
import { afterAll, expect } from 'vitest'

import { generateRefutationCoverage, REFUTATION_FILE_BASENAME } from '@systemfsoftware/effect-schema-refutation-vite'

const REFUTATION_PKG = '@systemfsoftware/effect-schema-law/refutation'

const Feature = makeFeature({ it, layer })

const MONEY = `export const Money = S.String.pipe(S.brand('Money'))\n`

const OBLIGATION_SCHEMA =
  `import * as S from 'effect/Schema'\nexport const Constrained = S.String.pipe(S.minLength(2))\n`

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

const coverageFor = (root: string): string =>
  generateRefutationCoverage(join(root, 'src', REFUTATION_FILE_BASENAME), join(root, 'src'))

const refutedIn = (code: string): string | undefined =>
  /const REFUTED: ReadonlySet<string> = new Set\(\[([^\]]*)\]\)/.exec(code)?.[1]

const exportedIn = (code: string): string[] => [...code.matchAll(/\[('[^']+'), schema_\d+\]/g)].map((m) => m[1] ?? '')

/** Fixture whose schemas carry obligations discharged by a refutes call. */
const DISCHARGED = makePackage('refutation-discharged-', {
  'constrained.schema.ts': OBLIGATION_SCHEMA,
  '__tests__/refute.ts': [
    `import { refutes } from '@systemfsoftware/effect-schema-law/refutation'`,
    `import { Constrained } from '../constrained.schema.js'`,
    `refutes(Constrained, {})`,
  ].join('\n'),
})

/** Fixture whose schemas carry no obligation at all. */
const NONE = makePackage('refutation-none-', {
  'money.schema.ts': MONEY,
})

/** Fixture whose refusals are inadequate — obligation exists but no refutes discharges it. */
const INADEQUATE = makePackage('refutation-inadequate-', {
  'constrained.schema.ts': OBLIGATION_SCHEMA,
})

afterAll(() => {
  for (const root of [DISCHARGED, NONE, INADEQUATE]) {
    rmSync(root, { recursive: true, force: true })
  }
})

Feature('Generating obligation coverage for every schema a package exports').body(({ scenario }) => {
  scenario(
    'A package whose constrained schema is discharged by a refutes call earns coverage',
    Gherkin.Do.pipe(
      Given('a package whose sole constrained schema states a refusal')('pkg', () => Effect.succeed(DISCHARGED)),
      When('the plugin generates that package\u2019s refutation suite')(
        'code',
        (s) => Effect.sync(() => coverageFor(s.pkg)),
      ),
      Then('the suite imports obligationsOf from the law refutation entry')((s) => {
        expect(s.code).toContain(`import { obligationsOf } from '${REFUTATION_PKG}'`)
      }),
      Then('the suite imports the AST type and vitest it')((s) => {
        expect(s.code).toContain(`from 'effect/SchemaAST'`)
        expect(s.code).toContain(`from 'vitest'`)
      }),
      Then('the suite imports nothing else beyond vitest and the law entry and AST')((s) => {
        // Only three imports plus schema imports
        expect(s.code).not.toContain("@systemfsoftware/effect-schema-law'")
        expect(s.code).not.toContain('@systemfsoftware/effect-schema-refutation')
        expect(s.code).toContain(REFUTATION_PKG)
      }),
      Then('the suite lists the constrained schema as refuted')((s) => {
        expect(refutedIn(s.code)).toContain('Constrained')
      }),
      Then('the suite lists the schema in EXPORTED')((s) => {
        expect(exportedIn(s.code)).toContain(`'Constrained'`)
      }),
      Then('the suite scans each schema exactly once')((s) => {
        const callSites = (s.code.match(/obligationsOf\(/g) ?? []).length
        // The scan is one call inside one map over EXPORTED, so the call-site
        // count stays 1 however many schemas the package exports. Counting bare
        // mentions instead would also count the import, the `typeof` in
        // EXPORTED's annotation, and the comment above the scan.
        expect(callSites).toBe(1)
        expect(s.code).toContain(
          'const scanned = EXPORTED.map(([name, schema]) => [name, [...obligationsOf(schema).keys()]] as const)',
        )
        expect(s.code).toContain('const covered = new Set<AST>()')
        expect(s.code).toContain('const naked = scanned')
      }),
      Then('the suite states the coverage assertion')((s) => {
        expect(s.code).toContain(`it('every obligation reachable from an exported schema is refuted somewhere'`)
      }),
    ),
  )

  scenario(
    'A package whose schemas carry no obligation still emits a valid suite',
    Gherkin.Do.pipe(
      Given('a package whose sole schema carries no obligation')('pkg', () => Effect.succeed(NONE)),
      When('the plugin generates that package\u2019s refutation suite')(
        'code',
        (s) => Effect.sync(() => coverageFor(s.pkg)),
      ),
      Then('the suite contains the coverage it block')((s) => {
        expect(s.code).toContain(`it('every obligation reachable from an exported schema is refuted somewhere'`)
      }),
      Then('the refuted set is empty')((s) => {
        expect(refutedIn(s.code)?.trim()).toBe('')
      }),
      Then('the suite imports obligationsOf and AST even when no obligation exists')((s) => {
        expect(s.code).toContain(`import { obligationsOf } from '${REFUTATION_PKG}'`)
        expect(s.code).toContain(`from 'effect/SchemaAST'`)
      }),
      Then('the suite remains syntactically valid')((s) => {
        expect(parseSync(REFUTATION_FILE_BASENAME, s.code).errors).toEqual([])
      }),
    ),
  )

  scenario(
    'A package whose refusals are inadequate emits a suite that omits the schema from REFUTED but keeps it in EXPORTED',
    Gherkin.Do.pipe(
      Given('a package whose constrained schema states no refusal')('pkg', () => Effect.succeed(INADEQUATE)),
      When('the plugin generates that package\u2019s refutation suite')(
        'code',
        (s) => Effect.sync(() => coverageFor(s.pkg)),
      ),
      Then('the suite omits that schema from REFUTED')((s) => {
        expect(refutedIn(s.code) ?? '').not.toContain('Constrained')
      }),
      Then('the suite still lists the schema in EXPORTED')((s) => {
        expect(exportedIn(s.code)).toContain(`'Constrained'`)
      }),
      Then('the suite contains the naked check that would throw')((s) => {
        expect(s.code).toContain('const naked = scanned')
        expect(s.code).toContain('throw new Error(`schema(s) reaching an obligation no refutes call discharges:')
      }),
      Then('the suite is syntactically valid')((s) => {
        expect(parseSync(REFUTATION_FILE_BASENAME, s.code).errors).toEqual([])
      }),
    ),
  )

  scenario(
    'A package that exports no schemas at all earns an empty suite',
    Gherkin.Do.pipe(
      Given('a package whose source folder holds no schema at all')('pkg', () =>
        Effect.succeed(
          makePackage('refutation-empty-', { 'helpers.ts': `export const ok = (x: string) => x.length > 0\n` }),
        )),
      When('the plugin generates that package\u2019s suite')('code', (s) => Effect.sync(() => coverageFor(s.pkg))),
      Then('the suite is the empty module')((s) => {
        expect(s.code).toBe('// no schemas found\nexport {}\n')
      }),
    ),
  )
})
