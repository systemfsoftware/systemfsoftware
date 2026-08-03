/**
 * generateSchemaLaws — emitted law-suite body for a consumer's schemas.
 *
 * Drives `generateSchemaLaws` through the package barrel: the test writes a
 * fixture source file containing several exported schemas (a `Schema.Struct`
 * const, two `.pipe(...)` shapes, a `Schema.Class`, a `Schema.TaggedClass`,
 * a `Schema.TaggedError`, and an unrelated class) into a temp directory,
 * then asserts the generated body has one `ruleOfSchemas` import per data
 * schema and no entries for the tagged error or the unrelated class.
 *
 * Two further scenarios pin the specifier rules: paths are written
 * relative to the law file (not absolute), and the empty-source case
 * yields the empty-module marker.
 */
import { Gherkin, Given, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { it, layer } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { afterAll, beforeAll, expect } from 'vitest'

import { generateSchemaLaws, LAW_FILE_BASENAME } from '../src/mod.js'

const Feature = makeFeature({ it, layer })

const FIXTURE = [
  `export const StructConst = Schema.Struct({ x: Schema.String })`,
  `export const PipedFromMember = S.String.pipe(S.pattern(/x/))`,
  `export const PipedFromCall = Schema.Struct({ x: Schema.String }).pipe(Schema.filter(ok))`,
  `export class DataClass extends Schema.Class<DataClass>('DataClass')({ x: Schema.String }) {}`,
  `export class TaggedData extends S.TaggedClass<TaggedData>()('TaggedData', {}) {}`,
  `export class Boom extends S.TaggedError<Boom>()('Boom', { cause: S.Unknown }) {}`,
  `export class Unrelated extends Array {}`,
  `const Unexported = Schema.Struct({ x: Schema.String })`,
].join('\n')

let root: string | undefined

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'schema-laws-'))
  mkdirSync(join(root, 'src', 'nested'), { recursive: true })
  writeFileSync(join(root, 'src', 'nested', 'schemas.ts'), FIXTURE)
})

afterAll(() => {
  if (root) rmSync(root, { recursive: true, force: true })
})

Feature('generateSchemaLaws — emitted law-suite body for a consumer src tree').body(({ scenario }) => {
  scenario(
    'A consumer source with five data schemas and one tagged error generates a rule-of-schemas entry per data schema and none for the error',
    Gherkin.Do.pipe(
      Given('a generated law-suite body')('code', () =>
        Effect.sync(() => {
          if (!root) throw new Error('fixture root was not created')
          return generateSchemaLaws(join(root!, 'src', LAW_FILE_BASENAME), join(root!, 'src'))
        })),
      When('each ruleOfSchemas argument name is mapped to the on-disk import path it resolves to')(
        'outcomes',
        (s) =>
          Effect.sync(() => {
            if (!root) throw new Error('fixture root was not created')
            const code = s.code
            const lawFileDir = dirname(join(root!, 'src', LAW_FILE_BASENAME))

            const importPaths = new Map(
              [...code.matchAll(/import \{ (\w+) \} from '([^']+)'/g)].map(([, name, path]) => [name, path]),
            )

            const outcomes: Record<string, string> = {}
            for (const [, name] of code.matchAll(/ruleOfSchemas\('([^']+)'/g)) {
              const path = importPaths.get(name ?? '')
              const onDisk = path === undefined ? undefined : `${resolve(lawFileDir, path)}.ts`
              outcomes[name ?? ''] = onDisk !== undefined && existsSync(onDisk) ? 'imports resolve' : 'imports broken'
            }
            return outcomes
          }),
      ),
      Then('the five data schemas map to imports that resolve on disk, and the tagged error is absent')((s) => {
        expect(s.outcomes).toEqual({
          StructConst: 'imports resolve',
          PipedFromMember: 'imports resolve',
          PipedFromCall: 'imports resolve',
          DataClass: 'imports resolve',
          TaggedData: 'imports resolve',
        })
      }),
    ),
  )

  scenario(
    'A consumer source whose schemas live in a nested directory emits import specifiers relative to the law file',
    Gherkin.Do.pipe(
      Given('a generated law-suite body whose schemas live under src/nested')('code', () =>
        Effect.sync(() => {
          if (!root) throw new Error('fixture root was not created')
          return generateSchemaLaws(join(root!, 'src', LAW_FILE_BASENAME), join(root!, 'src'))
        })),
      When('the emitted body is searched for an import specifier that targets the nested schemas file')(
        'specifier',
        (s) =>
          Effect.sync(() => {
            const matches = [...s.code.matchAll(/import \{ \w+ \} from '([^']+)'/g)]
            const hit = matches.find((m) => (m[1] ?? '').includes('./nested/schemas'))
            return hit?.[1] ?? ''
          }),
      ),
      Then('the specifier is the path from the law file to the nested schemas module')((s) => {
        expect(s.specifier).toBe('./nested/schemas')
      }),
    ),
  )

  scenario(
    'A consumer source with no exported schemas generates an empty-module body',
    Gherkin.Do.pipe(
      Given('an empty source directory')('empty', () =>
        Effect.sync(() => {
          const empty = mkdtempSync(join(tmpdir(), 'schema-laws-empty-'))
          mkdirSync(join(empty, 'src'))
          return empty
        })),
      When('the law-suite body is generated for the empty source')('body', (s) =>
        Effect.sync(() => {
          try {
            return generateSchemaLaws(join(s.empty, 'src', LAW_FILE_BASENAME), join(s.empty, 'src'))
          } finally {
            rmSync(s.empty, { recursive: true, force: true })
          }
        })),
      Then('the emitted body is the empty-module marker')((s) => {
        expect(s.body).toBe('// no schemas found\nexport {}\n')
      }),
    ),
  )
})
