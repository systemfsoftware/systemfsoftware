import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { generateSchemaLaws, LAW_FILE_BASENAME } from '../mod.js'

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

const generated = (): string => {
  if (!root) throw new Error('fixture root was not created')
  return generateSchemaLaws(join(root, 'src', LAW_FILE_BASENAME), join(root, 'src'))
}

const eachSpecifierExistsOnDisk = (): Record<string, string> => {
  const code = generated()
  const lawFileDir = dirname(join(root ?? '', 'src', LAW_FILE_BASENAME))

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
}

it('Should_LawTestEveryDataSchemaAndNoTaggedError_When_Generated', () => {
  expect(eachSpecifierExistsOnDisk()).toEqual({
    StructConst: 'imports resolve',
    PipedFromMember: 'imports resolve',
    PipedFromCall: 'imports resolve',
    DataClass: 'imports resolve',
    TaggedData: 'imports resolve',
  })
})

it('Should_EmitSpecifiersRelativeToTheLawFile_When_SchemasAreNested', () => {
  expect(generated()).toContain(`from './nested/schemas'`)
})

it('Should_EmitAnEmptyModule_When_NoSchemasAreExported', () => {
  const empty = mkdtempSync(join(tmpdir(), 'schema-laws-empty-'))
  mkdirSync(join(empty, 'src'))
  try {
    expect(generateSchemaLaws(join(empty, 'src', LAW_FILE_BASENAME), join(empty, 'src')))
      .toBe('// no schemas found\nexport {}\n')
  } finally {
    rmSync(empty, { recursive: true, force: true })
  }
})
