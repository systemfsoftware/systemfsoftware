import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer, type ViteDevServer } from 'vite'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { inlineSchemaTests } from '../mod.js'

const VIRTUAL_ID = 'virtual:@systemfsoftware/inline-schema-tests'

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
let server: ViteDevServer | undefined

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'inline-schema-tests-'))
  mkdirSync(join(root, 'src'))
  writeFileSync(join(root, 'src', 'schemas.ts'), FIXTURE)

  server = await createServer({
    configFile: false,
    root,
    logLevel: 'error',
    plugins: [inlineSchemaTests()],
  })
})

afterAll(async () => {
  await server?.close()
  if (root) rmSync(root, { recursive: true, force: true })
})

const lawTestedSchemas = async (): Promise<Record<string, string>> => {
  if (!server || !root) throw new Error('vite server was not started')

  const resolved = await server.pluginContainer.resolveId(VIRTUAL_ID)
  if (!resolved) return {}

  const loaded = await server.pluginContainer.load(resolved.id)
  const code = typeof loaded === 'string' ? loaded : loaded?.code ?? ''

  const importPaths = new Map(
    [...code.matchAll(/import \{ (\w+) \} from '([^']+)'/g)].map(([, name, path]) => [name, path]),
  )

  const importer = join(root, 'laws.test.ts')
  const outcomes: Record<string, string> = {}

  for (const [, name] of code.matchAll(/ruleOfSchemas\('([^']+)'/g)) {
    const path = importPaths.get(name ?? '')
    const target = path === undefined ? undefined : await server.pluginContainer.resolveId(path, importer)
    outcomes[name ?? ''] = target ? 'imports resolve' : 'imports broken'
  }

  return outcomes
}

it('Should_ImportAndLawTestEveryDataSchemaAndNoTaggedError_When_ResolvedThroughVite', async () => {
  await expect(lawTestedSchemas()).resolves.toEqual({
    StructConst: 'imports resolve',
    PipedFromMember: 'imports resolve',
    PipedFromCall: 'imports resolve',
    DataClass: 'imports resolve',
    TaggedData: 'imports resolve',
  })
})
