import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Result, Schema as S } from 'effect'
import { afterEach, expect } from 'vitest'

import { determineBuildModeEnabled, overrideOptions, parseTsConfig } from '../src/tsconfig-helpers.js'
import { resolveTestResource } from './__fixtures__/checker-harness.js'

const Feature = makeFeature({ it, layer })

const resolver = (...segments: string[]): string => resolveTestResource('errors', ...segments)

const expectRight = <A, E>(result: Result.Result<A, E>): A => {
  if (Result.isFailure(result)) {
    throw new Error(`Expected a Right result, got a Left: ${String(result.failure)}`)
  }
  return result.success
}

const parseErrorOf = (
  result: Result.Result<unknown, { readonly file: string; readonly reason: string }>,
): { readonly file: string; readonly reason: string } => {
  if (Result.isSuccess(result)) {
    throw new Error(`Expected a Left result, got: ${JSON.stringify(result.success)}`)
  }
  return {
    file: result.failure.file,
    reason: result.failure.reason,
  }
}

const decodeOverridden = (output: string): Record<string, unknown> =>
  S.decodeUnknownSync(S.Record(S.String, S.Unknown))(JSON.parse(output))

Feature('Parsing and overriding tsconfig files for the checker')
  .body(({ scenario }) => {
    scenario(
      'Should_PreserveGlob_When_IncludeUsesDoubleStar',
      Gherkin.Do.pipe(
        Given('a tsconfig whose include holds a glob')(
          'input',
          () => Effect.succeed('{"include":["src/**/*.workflow.ts"]}'),
        ),
        When('it is parsed')(
          'config',
          (s) => Effect.sync(() => parseTsConfig('tsconfig.json', s.input).pipe(expectRight)),
        ),
        Then('the glob is preserved byte for byte')((s) => {
          expect(s.config).toEqual({ include: ['src/**/*.workflow.ts'] })
        }),
      ),
    )

    scenario(
      'Should_RoundTripSchemaUrl_When_ParsingValidConfig',
      Gherkin.Do.pipe(
        Given('a tsconfig that declares a $schema URL')(
          'input',
          () => Effect.succeed('{"$schema":"https://json.schemastore.org/tsconfig"}'),
        ),
        When('it is parsed')(
          'config',
          (s) => Effect.sync(() => parseTsConfig('tsconfig.json', s.input).pipe(expectRight)),
        ),
        Then('the URL is preserved unchanged')((s) => {
          expect(s.config).toEqual({ $schema: 'https://json.schemastore.org/tsconfig' })
        }),
      ),
    )

    scenario(
      'Should_RoundTripWindowsPath_When_ParsingEscapedQuotes',
      Gherkin.Do.pipe(
        Given('a tsconfig holding a Windows path and an escaped quote')(
          'input',
          () =>
            Effect.succeed(
              '{"paths":{"a":["C:\\\\x//y"]},"description":"he said \\"hi\\""}',
            ),
        ),
        When('it is parsed')(
          'config',
          (s) => Effect.sync(() => parseTsConfig('tsconfig.json', s.input).pipe(expectRight)),
        ),
        Then('the path and the quote are preserved')((s) => {
          expect(s.config).toEqual({
            paths: { a: ['C:\\x//y'] },
            description: 'he said "hi"',
          })
        }),
      ),
    )

    scenario(
      'Should_AcceptTrailingCommas_When_ParsingNestedObjects',
      Gherkin.Do.pipe(
        Given('a tsconfig with trailing commas in nested objects and arrays')(
          'input',
          () =>
            Effect.succeed(
              '{"compilerOptions":{"strict":true,},"include":["a.ts","b.ts",]}',
            ),
        ),
        When('it is parsed')(
          'config',
          (s) => Effect.sync(() => parseTsConfig('tsconfig.json', s.input).pipe(expectRight)),
        ),
        Then('the trailing commas are tolerated and the values kept')((s) => {
          expect(s.config).toEqual({
            compilerOptions: { strict: true },
            include: ['a.ts', 'b.ts'],
          })
        }),
      ),
    )

    scenario(
      'Should_AcceptBom_When_ParsingByteOrderMarkedInput',
      Gherkin.Do.pipe(
        Given('the same tsconfig with and without a leading BOM')(
          'inputs',
          () =>
            Effect.succeed([
              '{"compilerOptions":{"strict":true}}',
              '\uFEFF{"compilerOptions":{"strict":true}}',
            ]),
        ),
        When('both are parsed')(
          'configs',
          (s) => Effect.sync(() => s.inputs.map((input) => parseTsConfig('tsconfig.json', input).pipe(expectRight))),
        ),
        Then('the BOM-prefixed document parses identically')((s) => {
          const withoutBom = s.configs[0]
          const withBom = s.configs[1]
          if (withoutBom === undefined || withBom === undefined) {
            throw new Error('expected two parsed configs')
          }
          expect(withBom).toEqual(withoutBom)
        }),
      ),
    )

    scenario(
      'Should_StripComments_When_ParsingAnnotatedConfig',
      Gherkin.Do.pipe(
        Given('a tsconfig carrying line and block comments')(
          'input',
          () => Effect.succeed('{\n// a line comment\n"a": 1,\n/* a block comment */\n"b": 2\n}'),
        ),
        When('it is parsed')(
          'config',
          (s) => Effect.sync(() => parseTsConfig('tsconfig.json', s.input).pipe(expectRight)),
        ),
        Then('the comments are gone and the values remain')((s) => {
          expect(s.config).toEqual({ a: 1, b: 2 })
        }),
      ),
    )

    scenario(
      'Should_PreserveUnknownCompilerOptions_When_Parsing',
      Gherkin.Do.pipe(
        Given('a tsconfig with an unknown nested compiler option')(
          'input',
          () =>
            Effect.succeed(
              '{"compilerOptions":{"strict":true,"experimentalDecorators":true}}',
            ),
        ),
        When('it is parsed')(
          'config',
          (s) => Effect.sync(() => parseTsConfig('tsconfig.json', s.input).pipe(expectRight)),
        ),
        Then('the unknown option survives inside compilerOptions')((s) => {
          expect(s.config['compilerOptions']).toEqual({
            strict: true,
            experimentalDecorators: true,
          })
        }),
      ),
    )

    scenario(
      'Should_ReportLeft_When_DocumentIsMalformed',
      Gherkin.Do.pipe(
        Given('a document with a dangling colon')(
          'input',
          () => Effect.succeed('{ "a": }'),
        ),
        When('it is parsed')('result', (s) => Effect.sync(() => parseTsConfig('tsconfig.json', s.input))),
        Then('the parse fails with a TsConfigParseError naming the file')((s) => {
          expect(Result.isFailure(s.result)).toBe(true)
          const parsed = parseErrorOf(s.result)
          expect(parsed.file).toBe('tsconfig.json')
          expect(parsed.reason.length).toBeGreaterThan(0)
        }),
      ),
    )

    scenario(
      'Should_ReportLeft_When_InputIsTruncated',
      Gherkin.Do.pipe(
        Given('truncated documents')('inputs', () => Effect.succeed(['{', '{"a":'])),
        When('each is parsed')(
          'results',
          (s) => Effect.sync(() => s.inputs.map((input) => parseTsConfig('tsconfig.json', input))),
        ),
        Then('every truncated document fails to parse')((s) => {
          for (const result of s.results) {
            expect(Result.isFailure(result)).toBe(true)
          }
        }),
      ),
    )

    scenario(
      'Should_ReportLeft_When_BlockCommentIsUnterminated',
      Gherkin.Do.pipe(
        Given('a document with an unterminated block comment')(
          'input',
          () => Effect.succeed('{"a":1,/* never closed'),
        ),
        When('it is parsed')('result', (s) => Effect.sync(() => parseTsConfig('tsconfig.json', s.input))),
        Then('the parse fails')((s) => {
          expect(Result.isFailure(s.result)).toBe(true)
        }),
      ),
    )

    scenario(
      'Should_ReportLeft_When_RootIsABareString',
      Gherkin.Do.pipe(
        Given('a bare string root instead of a config object')(
          'input',
          () => Effect.succeed('"just a string"'),
        ),
        When('it is parsed')('result', (s) => Effect.sync(() => parseTsConfig('tsconfig.json', s.input))),
        Then('the parse fails because a string is not a config object')((s) => {
          expect(Result.isFailure(s.result)).toBe(true)
          expect(parseErrorOf(s.result).reason.length).toBeGreaterThan(0)
        }),
      ),
    )

    scenario(
      'Should_ReportLeft_When_ReferencesIsNotAnArray',
      Gherkin.Do.pipe(
        Given('a document whose references hold a string')(
          'input',
          () => Effect.succeed('{"references":"nope"}'),
        ),
        When('it is parsed')('result', (s) => Effect.sync(() => parseTsConfig('tsconfig.json', s.input))),
        Then('the parse fails because references must be an array')((s) => {
          expect(Result.isFailure(s.result)).toBe(true)
          expect(parseErrorOf(s.result).reason.length).toBeGreaterThan(0)
        }),
      ),
    )

    scenario(
      'Should_ApplyOverrides_When_ConfigIsEmpty',
      Gherkin.Do.pipe(
        Given('an empty config')(() => Effect.succeed({})),
        When('the compiler-option overrides are applied without build mode')(
          'output',
          () => Effect.sync(() => decodeOverridden(overrideOptions({}, false))),
        ),
        Then('code-quality options are relaxed and emit is disabled')((s) => {
          const compilerOptions = s.output['compilerOptions']
          expect(compilerOptions).toMatchObject({
            allowUnreachableCode: true,
            noEmit: true,
          })
        }),
      ),
    )

    scenario(
      'Should_NotInjectModuleResolution_When_ConsumerDeclaresModule',
      Gherkin.Do.pipe(
        Given('a config that declares the consumer module')(
          'config',
          () =>
            Effect.sync(() =>
              expectRight(
                parseTsConfig('tsconfig.json', '{"compilerOptions":{"module":"NodeNext"}}'),
              )
            ),
        ),
        When('the overrides are applied')(
          'output',
          (s) => Effect.sync(() => decodeOverridden(overrideOptions(s.config, false))),
        ),
        Then('the module is preserved and moduleResolution stays absent')((s) => {
          expect(s.output['compilerOptions']).not.toHaveProperty('moduleResolution')
          expect(s.output['compilerOptions']).toMatchObject({ module: 'NodeNext' })
        }),
      ),
    )

    scenario(
      'Should_PreserveConsumerCompilerOptions_When_Overriding',
      Gherkin.Do.pipe(
        Given('a config declaring its own target and moduleResolution')(
          'config',
          () =>
            Effect.sync(() =>
              expectRight(
                parseTsConfig(
                  'tsconfig.json',
                  '{"compilerOptions":{"target":"es2024","moduleResolution":"NodeNext"}}',
                ),
              )
            ),
        ),
        When('the overrides are applied')(
          'output',
          (s) => Effect.sync(() => decodeOverridden(overrideOptions(s.config, false))),
        ),
        Then('the consumer target and moduleResolution pass through verbatim')((s) => {
          expect(s.output['compilerOptions']).toMatchObject({
            target: 'es2024',
            moduleResolution: 'NodeNext',
          })
        }),
      ),
    )

    scenario(
      'Should_PreserveUnknownKeys_When_Overriding',
      Gherkin.Do.pipe(
        Given('a config with unknown top-level keys and unknown compilerOptions')(
          'config',
          () =>
            Effect.sync(() =>
              expectRight(
                parseTsConfig(
                  'tsconfig.json',
                  '{"include":["src/**/*.ts"],"compilerOptions":{"strict":true,"experimentalDecorators":true}}',
                ),
              )
            ),
        ),
        When('the overrides are applied')(
          'output',
          (s) => Effect.sync(() => decodeOverridden(overrideOptions(s.config, false))),
        ),
        Then('the unknown keys are preserved in the output')((s) => {
          expect(s.output['include']).toEqual(['src/**/*.ts'])
          expect(s.output['compilerOptions']).toMatchObject({
            strict: true,
            experimentalDecorators: true,
          })
        }),
      ),
    )

    scenario(
      'Should_EnableBuildMode_When_ConfigHasReferences',
      Gherkin.Do.pipe(
        Given('a tsconfig with references on disk')(
          'file',
          () => Effect.sync(() => createTsconfig('{"references":[{"path":"./a"}]}')),
        ),
        When('the build-mode helper reads it')('enabled', (s) => Effect.sync(() => determineBuildModeEnabled(s.file))),
        Then('build mode is enabled')((s) => {
          expect(s.enabled).toBe(true)
        }),
      ),
    )

    scenario(
      'Should_DisableBuildMode_When_ConfigHasNoReferences',
      Gherkin.Do.pipe(
        Given('a config without references on disk')(
          'file',
          () => Effect.sync(() => createTsconfig('{"compilerOptions":{"strict":true}}')),
        ),
        When('the build-mode helper reads it')('enabled', (s) => Effect.sync(() => determineBuildModeEnabled(s.file))),
        Then('build mode stays disabled')((s) => {
          expect(s.enabled).toBe(false)
        }),
      ),
    )

    scenario(
      'Should_DisableBuildMode_When_ConfigIsABareString',
      Gherkin.Do.pipe(
        Given('a config file holding a bare string')(
          'file',
          () => Effect.sync(() => createTsconfig('"just a string"')),
        ),
        When('the build-mode helper reads it')('enabled', (s) => Effect.sync(() => determineBuildModeEnabled(s.file))),
        Then('build mode stays disabled without throwing')((s) => {
          expect(s.enabled).toBe(false)
        }),
      ),
    )

    scenario(
      'Should_DisableBuildMode_When_ReferencesIsNotArray',
      Gherkin.Do.pipe(
        Given('a config whose references hold a string')(
          'file',
          () => Effect.sync(() => createTsconfig('{"references":"nope"}')),
        ),
        When('the build-mode helper reads it')('enabled', (s) => Effect.sync(() => determineBuildModeEnabled(s.file))),
        Then('build mode stays disabled')((s) => {
          expect(s.enabled).toBe(false)
        }),
      ),
    )
  })

let tempTsconfigDir: string | undefined

const createTsconfig = (content: string): string => {
  tempTsconfigDir = mkdtempSync(path.join(tmpdir(), 'tsconfig-helpers-'))
  const tsconfigPath = path.join(tempTsconfigDir, 'tsconfig.json')
  writeFileSync(tsconfigPath, content)
  return tsconfigPath
}

afterEach(() => {
  if (tempTsconfigDir !== undefined) {
    rmSync(tempTsconfigDir, { recursive: true, force: true })
  }
})
