/**
 * Pins the declaration-output contract this workspace patches into
 * `rolldown-plugin-dts`: an entry chunk that emits inline `export declare`
 * statements beside a non-exported local declaration must still carry an
 * `export {}` marker, so TypeScript reads the locals as module-private and API
 * Extractor stops reporting them as public API.
 *
 * The fixture is a real package built by the real tsdown programmatic API with
 * the repo's `quietBuild` fragment, and the leak is read back from API
 * Extractor's own doc model, never from a string this test wrote.
 */
import { Extractor, ExtractorConfig } from '@microsoft/api-extractor'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { build } from 'tsdown'
import { expect, it } from 'vitest'

import { quietBuild } from '../src/quiet-build.js'

/**
 * The entry exports `f`, whose signature names `Options`; `Options` itself is
 * declared locally, so only the marker keeps it out of the public API.
 */
const ENTRY_SOURCE = `export interface Result {
  ok: boolean
}

interface Options {
  value: string
}

export function f(options: Options): Result {
  return { ok: options.value.length > 0 }
}
`

const FIXTURE_TSCONFIG = JSON.stringify({
  compilerOptions: {
    target: 'esnext',
    module: 'esnext',
    moduleResolution: 'bundler',
    strict: true,
    declaration: true,
    skipLibCheck: true,
  },
})

const FIXTURE_PACKAGE_JSON = JSON.stringify({
  name: 'dts-export-marker-fixture',
  version: '0.0.0',
  type: 'module',
})

interface DocModel {
  readonly members: ReadonlyArray<{ readonly members?: ReadonlyArray<{ readonly name: string }> }>
}

interface BuiltEntry {
  readonly declaration: string
  readonly exportedMembers: ReadonlyArray<string>
}

/**
 * The names API Extractor considers exported by `dtsPath`, read from the doc
 * model it writes; a local declaration that leaked into the public surface
 * appears here, an `export {}`-scoped one does not.
 */
const exportedMembersOf = async (projectFolder: string, dtsPath: string): Promise<ReadonlyArray<string>> => {
  const modelPath = join(projectFolder, 'dts-export-marker.api.json')
  const extractorConfig = ExtractorConfig.prepare({
    configObject: {
      projectFolder,
      mainEntryPointFilePath: dtsPath,
      compiler: {
        overrideTsconfig: {
          compilerOptions: { target: 'esnext', module: 'esnext', moduleResolution: 'bundler', strict: true },
        },
      },
      docModel: { enabled: true, apiJsonFilePath: modelPath },
      apiReport: { enabled: false },
      dtsRollup: { enabled: false },
      tsdocMetadata: { enabled: false },
    },
    configObjectFullPath: undefined,
    packageJsonFullPath: join(projectFolder, 'package.json'),
  })
  Extractor.invoke(extractorConfig, { localBuild: true, messageCallback: () => {} })
  const model = JSON.parse(await readFile(modelPath, 'utf8')) as DocModel
  return (model.members[0]?.members ?? []).map((member) => member.name)
}

const buildEntry = async (): Promise<BuiltEntry> => {
  const projectFolder = await mkdtemp(join(tmpdir(), 'tsdown-config-dts-marker-'))
  try {
    await writeFile(join(projectFolder, 'index.ts'), ENTRY_SOURCE)
    await writeFile(join(projectFolder, 'tsconfig.json'), FIXTURE_TSCONFIG)
    await writeFile(join(projectFolder, 'package.json'), FIXTURE_PACKAGE_JSON)
    await build({
      ...quietBuild,
      entry: [join(projectFolder, 'index.ts')],
      outDir: join(projectFolder, 'dist'),
      dts: true,
      format: 'esm',
      platform: 'node',
      config: false,
      tsconfig: join(projectFolder, 'tsconfig.json'),
      outExtensions: () => ({ js: '.mjs', dts: '.d.ts' }),
    })
    const dtsPath = join(projectFolder, 'dist', 'index.d.ts')
    const declaration = await readFile(dtsPath, 'utf8')
    return { declaration, exportedMembers: await exportedMembersOf(projectFolder, dtsPath) }
  } finally {
    await rm(projectFolder, { recursive: true, force: true })
  }
}

it('Should_KeepAnUnexportedLocalPrivate_When_TheEntryCarriesNoExportList', async () => {
  const built = await buildEntry()
  expect(built.declaration).toContain('export {}')
  expect(built.exportedMembers).toEqual(['f', 'Result'])
})
