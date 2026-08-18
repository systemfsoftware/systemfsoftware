/**
 * Characterization test for TSConfigPreprocessor behavior.
 *
 * TSConfigPreprocessor (from @stryker-mutator/core/src/sandbox/ts-config-preprocessor.ts)
 * rewrites tsconfig.json references/extends/file arrays before the sandbox copy.
 * Its parse boundary is the TS7-native `parseTsConfig`, and the write-back keeps
 * every key and the original key order (a decode would hoist declared schema fields).
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { fileURLToPath } from 'url'

import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { type Logger } from '@systemfsoftware/stryker-js-plugin-api/logging'
import { Effect, Result } from 'effect'
import { afterEach, expect, vi } from 'vitest'
import type { Mock } from 'vitest'

import { createDefaultOptions } from '../src/config/options-validator.js'
import { FileSystem } from '../src/project/file-system.js'
import { ProjectFile } from '../src/project/project-file.js'
import { Project } from '../src/project/project.js'
import { parseTsConfig, TsConfigParseError } from '../src/sandbox/parse-config-helper.js'
import { TSConfigPreprocessor } from '../src/sandbox/ts-config-preprocessor.js'

const Feature = makeFeature({ it, layer })

// Resolve the single-project fixture from the sibling typescript-checker package
const fixtureDir = resolve(
  fileURLToPath(import.meta.url),
  '..', // tests
  '..', // mutation-run
  '..', // stryker-js
  'typescript-checker',
  'testResources',
  'single-project',
)

const fixtureTsconfig = resolve(fixtureDir, 'tsconfig.json')

const expectRight = <A>(either: Result.Result<A, TsConfigParseError>): A => {
  if (Result.isFailure(either)) {
    throw new Error(`Expected a Right result, got a Left: ${String(either.failure)}`)
  }
  return either.success
}

// The tsconfig must live inside cwd (under git-ignored `.stryker-tmp`) so reference/include
// paths are NOT rewritten — otherwise the values the round-trip test asserts would change.
const tempRoot = resolve(process.cwd(), '.stryker-tmp', 'ts-config-preprocessor-it')

const createTempTsconfig = (caseName: string, content: string): string => {
  const dir = join(tempRoot, caseName)
  mkdirSync(dir, { recursive: true })
  const tsconfigPath = join(dir, 'tsconfig.json')
  writeFileSync(tsconfigPath, content, 'utf-8')
  return tsconfigPath
}

interface PreprocessorSut {
  project: Project
  tsconfigFile: ProjectFile
  preprocessor: TSConfigPreprocessor
  warn: Mock<(message: string, ...args: readonly unknown[]) => void>
}

function createSut(tsconfigPath: string): PreprocessorSut {
  const warn = vi.fn<(message: string, ...args: readonly unknown[]) => void>()
  const log: Logger = {
    isTraceEnabled: () => false,
    isDebugEnabled: () => false,
    isInfoEnabled: () => false,
    isWarnEnabled: () => true,
    isErrorEnabled: () => false,
    isFatalEnabled: () => false,
    trace: () => {},
    debug: () => {},
    info: () => {},
    warn,
    error: () => {},
    fatal: () => {},
  }
  // Build a new options object rather than assigning through the readonly default.
  const options = { ...createDefaultOptions(), tsconfigFile: tsconfigPath }
  const preprocessor = new TSConfigPreprocessor(log, options)
  const project = new Project(new FileSystem(), { [tsconfigPath]: { mutate: false } })
  const tsconfigFile = project.files.get(tsconfigPath)
  if (tsconfigFile === undefined) {
    throw new Error(`Expected ${tsconfigPath} to be part of the project`)
  }
  return { project, tsconfigFile, preprocessor, warn }
}

afterEach(() => {
  rmSync(tempRoot, { recursive: true, force: true })
})

Feature('TSConfigPreprocessor')
  .body(({ scenario }) => {
    // 1. parseTsConfig — used by TSConfigPreprocessor.rewriteTSConfigFile
    scenario(
      'Should_ParseTheFixture_When_GivenTheSingleProjectTsconfig',
      Gherkin.Do.pipe(
        Given('the single-project fixture tsconfig')(
          'raw',
          () => Effect.succeed(readFileSync(fixtureTsconfig, 'utf-8')),
        ),
        When('it is parsed')('config', (s) => Effect.sync(() => expectRight(parseTsConfig(fixtureTsconfig, s.raw)))),
        Then('the config object carries compiler options')((s) => {
          expect(s.config).toBeTypeOf('object')
          expect(s.config['compilerOptions']).toBeTypeOf('object')
        }),
      ),
    )

    scenario(
      'Should_KeepTheFixtureCompilerOptions_When_ParsingTheSingleProject',
      Gherkin.Do.pipe(
        Given('the single-project fixture tsconfig')(
          'raw',
          () => Effect.succeed(readFileSync(fixtureTsconfig, 'utf-8')),
        ),
        When('it is parsed')('config', (s) => Effect.sync(() => expectRight(parseTsConfig(fixtureTsconfig, s.raw)))),
        Then('the expected compilerOptions fields are present')((s) => {
          expect(s.config['compilerOptions']).toMatchObject({
            strict: true,
            module: 'commonjs',
            outDir: 'dist',
            noUnusedLocals: true,
            noUnusedParameters: true,
            types: [],
          })
        }),
      ),
    )

    scenario(
      'Should_ParseExtendsAndReferences_When_PresentInTheConfig',
      Gherkin.Do.pipe(
        Given('a config declaring extends and references')('input', () =>
          Effect.succeed(
            JSON.stringify({
              extends: '../../tsconfig.base.json',
              references: [{ path: '../shared' }, { path: '../utils/tsconfig.json' }],
              compilerOptions: { strict: true },
            }),
          )),
        When('it is parsed')('config', (s) => Effect.sync(() => expectRight(parseTsConfig('tsconfig.json', s.input)))),
        Then('extends and references round-trip')((s) => {
          expect(s.config['extends']).toBe('../../tsconfig.base.json')
          expect(s.config['references']).toEqual([
            { path: '../shared' },
            { path: '../utils/tsconfig.json' },
          ])
          expect(s.config['compilerOptions']).toMatchObject({ strict: true })
        }),
      ),
    )

    scenario(
      'Should_ParseCommentedGlobs_When_TheConfigCarriesAComment',
      Gherkin.Do.pipe(
        Given('a commented tsconfig with a //-bearing $schema value')('config', (s) =>
          Effect.sync(() => {
            const input = [
              '{',
              '  // base tsconfig',
              '  "$schema": "https://json.schemastore.org/tsconfig",',
              '  "files": ["src/index.ts", "src/utils.ts"],',
              '  "include": ["src/**/*.ts"],',
              '  "exclude": ["node_modules", "dist"],',
              '}',
            ].join('\n')
            return expectRight(parseTsConfig('tsconfig.json', input))
          })),
        Then('the glob, the //-bearing URL, and the arrays are intact')((s) => {
          expect(s.config['files']).toEqual(['src/index.ts', 'src/utils.ts'])
          expect(s.config['include']).toEqual(['src/**/*.ts'])
          expect(s.config['exclude']).toEqual(['node_modules', 'dist'])
          expect(s.config['$schema']).toBe('https://json.schemastore.org/tsconfig')
        }),
      ),
    )

    scenario(
      'Should_AcceptTrailingCommas_When_LikeTsc',
      Gherkin.Do.pipe(
        Given('a tsconfig with a trailing comma in compilerOptions')(
          'input',
          () => Effect.succeed('{ "compilerOptions": { "strict": true, } }'),
        ),
        When('it is parsed')('config', (s) => Effect.sync(() => expectRight(parseTsConfig('tsconfig.json', s.input)))),
        Then('the trailing comma is tolerated')((s) => {
          expect(s.config).toEqual({ compilerOptions: { strict: true } })
        }),
      ),
    )

    scenario(
      'Should_SurfaceAnErrorForEmptyInput',
      Gherkin.Do.pipe(
        Given('an empty document')('input', () => Effect.succeed('')),
        When('it is parsed')('result', (s) => Effect.sync(() => parseTsConfig('tsconfig.json', s.input))),
        Then('the parse is a failure naming the file')((s) => {
          expect(Result.isFailure(s.result)).toBe(true)
          if (Result.isFailure(s.result)) {
            expect(s.result.failure).toBeInstanceOf(TsConfigParseError)
            expect(s.result.failure.file).toBe('tsconfig.json')
            expect(s.result.failure.reason.length).toBeGreaterThan(0)
          }
        }),
      ),
    )

    scenario(
      'Should_RejectANonObjectRoot_When_TheJsonIsABareString',
      Gherkin.Do.pipe(
        Given('a bare string document')('input', () => Effect.succeed('"just a string"')),
        When('it is parsed')('result', (s) => Effect.sync(() => parseTsConfig('tsconfig.json', s.input))),
        Then('the shape error reports the mismatch')((s) => {
          expect(Result.isFailure(s.result)).toBe(true)
          if (Result.isFailure(s.result)) {
            expect(s.result.failure).toBeInstanceOf(TsConfigParseError)
            expect(s.result.failure.file).toBe('tsconfig.json')
            expect(s.result.failure.reason).toContain('does not match the tsconfig shape')
          }
        }),
      ),
    )

    // 2. parseTsConfig over the commented fixture — comment stripping
    scenario(
      'Should_ParseTheCommentedFixture_WithItsValuesIntact',
      Gherkin.Do.pipe(
        Given('the commented fixture raw text')('raw', () => Effect.succeed(readFileSync(fixtureTsconfig, 'utf-8'))),
        When('it is parsed')('config', (s) => Effect.sync(() => expectRight(parseTsConfig(fixtureTsconfig, s.raw)))),
        Then('the commented compiler option survives')((s) => {
          expect(s.config['compilerOptions']).toMatchObject({ noUnusedLocals: true })
        }),
      ),
    )

    scenario(
      'Should_ParseTheCommentedFixture_ToAConfigObject',
      Gherkin.Do.pipe(
        Given('the commented fixture raw text')('raw', () => Effect.succeed(readFileSync(fixtureTsconfig, 'utf-8'))),
        When('it is parsed')('config', (s) => Effect.sync(() => expectRight(parseTsConfig(fixtureTsconfig, s.raw)))),
        Then('an object config comes back')((s) => {
          expect(s.config).toBeTypeOf('object')
        }),
      ),
    )

    // 4. End-to-end: TSConfigPreprocessor over a real project
    //    (boundary soundness + write-back round-trip)
    scenario(
      'Should_WarnAndSkipRewrite_When_TheTsconfigRootIsABareString',
      Gherkin.Do.pipe(
        Given('a temp tsconfig holding a bare string')('sut', () =>
          Effect.sync(() => {
            const tsconfigPath = createTempTsconfig('bare-string', '"just a string"')
            return { ...createSut(tsconfigPath), tsconfigPath }
          })),
        When('the preprocessor runs')(
          'done',
          (s) => Effect.promise(() => s.sut.preprocessor.preprocess(s.sut.project)),
        ),
        Then('the warn branch reports the shape mismatch and the file is untouched')((s) => {
          expect(s.sut.warn).toHaveBeenCalledWith(
            expect.stringContaining('Could not rewrite tsconfig file'),
            s.sut.tsconfigPath,
            expect.stringContaining('does not match the tsconfig shape'),
          )
        }),
      ),
    )

    // Continue below with the remaining boundary, round-trip and array-extends cases.
    scenario(
      'Should_WarnAndLeaveTheFileUntouched_When_TheTsconfigCannotBeParsed',
      Gherkin.Do.pipe(
        Given('a temp tsconfig with truncated JSON')('sut', () =>
          Effect.sync(() => {
            const tsconfigPath = createTempTsconfig('malformed', '{"compilerOptions": {')
            return { ...createSut(tsconfigPath), tsconfigPath }
          })),
        When('the preprocessor runs and the file is re-read')('result', (s) =>
          Effect.promise(async () => {
            await s.sut.preprocessor.preprocess(s.sut.project)
            const firstCall = s.sut.warn.mock.calls[0]
            return {
              message: firstCall === undefined ? undefined : firstCall[0],
              content: await s.sut.tsconfigFile.readContent(),
            }
          })),
        Then('the warn branch reports the JSONC failure and the file is untouched')((s) => {
          expect(s.sut.warn).toHaveBeenCalledWith(
            expect.stringContaining('Could not rewrite tsconfig file'),
            s.sut.tsconfigPath,
            expect.stringContaining('Cannot parse JSONC'),
          )
          expect(String(s.result.message)).toContain('were not rewritten for the sandbox')
          expect(s.result.content).toBe('{"compilerOptions": {')
        }),
      ),
    )

    scenario(
      'Should_WriteBackEveryKey_When_InTheOriginalOrder',
      Gherkin.Do.pipe(
        Given('a tsconfig with undeclared keys and a label-first reference')('sut', () =>
          Effect.sync(() => {
            const input = {
              $schema: 'https://json.schemastore.org/tsconfig',
              compilerOptions: { strict: true },
              include: ['src/**/*.ts'],
              references: [{ label: 'app', path: 'tsconfig.app.json' }],
            }
            const tsconfigPath = createTempTsconfig('round-trip', JSON.stringify(input, null, 2))
            return { ...createSut(tsconfigPath), input }
          })),
        When('the preprocessor runs')('written', (s) =>
          Effect.promise(async () => {
            await s.sut.preprocessor.preprocess(s.sut.project)
            return JSON.parse(await s.sut.tsconfigFile.readContent()) as Record<string, unknown>
          })),
        Then('the key order and every value survive')((s) => {
          expect(Object.keys(s.written)).toEqual(['$schema', 'compilerOptions', 'include', 'references'])
          expect(s.written).toEqual(s.sut.input)
        }),
      ),
    )

    scenario(
      'Should_RewriteReferences_When_ExtendsIsAnArray',
      Gherkin.Do.pipe(
        Given('a config whose extends is an array, plus an outside reference')('sut', () =>
          Effect.sync(() => {
            const input = {
              extends: ['../../../../outside-base.json', '@scope/preset'],
              references: [{ path: '../../../../outside-project' }],
            }
            const tsconfigPath = createTempTsconfig('array-extends', JSON.stringify(input, null, 2))
            return { ...createSut(tsconfigPath), input }
          })),
        When('the preprocessor runs')('written', (s) =>
          Effect.promise(async () => {
            await s.sut.preprocessor.preprocess(s.sut.project)
            return JSON.parse(await s.sut.tsconfigFile.readContent()) as Record<string, unknown>
          })),
        Then('each array extends entry and the reference are rewritten independently')((s) => {
          expect(s.sut.warn).not.toHaveBeenCalled()
          expect(s.written['extends']).toEqual(['../../../../../../outside-base.json', '@scope/preset'])
          const references = s.written['references'] as Record<string, unknown>[]
          const [first] = references
          expect(first?.['path']).toBe('../../../../../../outside-project/tsconfig.json')
        }),
      ),
    )
  })
