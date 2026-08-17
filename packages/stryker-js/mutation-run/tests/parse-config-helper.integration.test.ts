/**
 * The tsconfig parser: JSONC-tolerant, shape-checked against the TsConfig
 * schema, BOM-aware, and lossless for keys the schema does not declare.
 */
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { type StrykerOptions } from '@systemfsoftware/stryker-js-plugin-api/core'
import { Effect, Result } from 'effect'
import { expect } from 'vitest'

import { parseTsConfig, TsConfigParseError } from '../src/sandbox/parse-config-helper.js'

const Feature = makeFeature({ it, layer })

const tsconfigOptionNames: (keyof StrykerOptions)[] = ['tsconfigFile']

const expectRight = <A>(either: Result.Result<A, TsConfigParseError>): A => {
  if (Result.isFailure(either)) {
    throw new Error(`Expected a Right result, got a Left: ${String(either.failure)}`)
  }
  return either.success
}

const failureOf = <A>(either: Result.Result<A, TsConfigParseError>): TsConfigParseError => {
  if (Result.isSuccess(either)) {
    throw new Error(`Expected a Left result, got a Right: ${JSON.stringify(either.success)}`)
  }
  return either.failure
}

Feature('tsconfig parsing with JSONC tolerance')
  .body(({ scenario }) => {
    scenario(
      'Should_ParseBlockComments_When_TheContentContainsThem',
      Gherkin.Do.pipe(
        Given('JSONC with an inner block comment')('input', () => Effect.succeed('{ "a": /* inner */ 1 }')),
        When('the tsconfig is parsed')(
          'config',
          (s) => Effect.sync(() => expectRight(parseTsConfig('tsconfig.json', s.input))),
        ),
        Then('the comment is dropped and the value kept')((s) => {
          expect(s.config).toEqual({ a: 1 })
        }),
      ),
    )

    scenario(
      'Should_ParseLineComments_When_TheContentContainsThem',
      Gherkin.Do.pipe(
        Given('a tsconfig with line comments')('input', () => Effect.succeed('{\n  // a comment\n  "a": 1\n}')),
        When('the tsconfig is parsed')(
          'config',
          (s) => Effect.sync(() => expectRight(parseTsConfig('tsconfig.json', s.input))),
        ),
        Then('the comments are dropped and the object returned')((s) => {
          expect(s.config).toEqual({ a: 1 })
        }),
      ),
    )

    scenario(
      'Should_ReturnTheParsedObject_When_TheJsonCarriesComments',
      Gherkin.Do.pipe(
        Given('a multi-key object with comments')(
          'input',
          () => Effect.succeed('{\n  // comment\n  "a": 1,\n  "b": "two"\n}'),
        ),
        When('the tsconfig is parsed')(
          'config',
          (s) => Effect.sync(() => expectRight(parseTsConfig('tsconfig.json', s.input))),
        ),
        Then('the object equals the comment-free original')((s) => {
          expect(s.config).toEqual({ a: 1, b: 'two' })
        }),
      ),
    )

    scenario(
      'Should_ReportAMalformedInput_When_TheJsonIsBroken',
      Gherkin.Do.pipe(
        Given('a syntactically broken object')('input', () => Effect.succeed('{ "a": }')),
        When('the tsconfig is parsed')(
          'failure',
          (s) => Effect.sync(() => failureOf(parseTsConfig('tsconfig.json', s.input))),
        ),
        Then('a file-annotated parse error is reported')((s) => {
          expect(s.failure).toBeInstanceOf(TsConfigParseError)
          expect(s.failure.file).toBe('tsconfig.json')
          expect(s.failure.reason.length).toBeGreaterThan(0)
        }),
      ),
    )

    scenario(
      'Should_ReturnAMalformedError_When_TheInputIsEmpty',
      Gherkin.Do.pipe(
        Given('an empty document')('input', () => Effect.succeed('')),
        When('the tsconfig is parsed')(
          'failure',
          (s) => Effect.sync(() => failureOf(parseTsConfig('tsconfig.json', s.input))),
        ),
        Then('a file-annotated parse error is reported')((s) => {
          expect(s.failure).toBeInstanceOf(TsConfigParseError)
          expect(s.failure.file).toBe('tsconfig.json')
          expect(s.failure.reason.length).toBeGreaterThan(0)
        }),
      ),
    )

    scenario(
      'Should_RejectABareStringRoot_When_TheDocumentIsNotAnObject',
      Gherkin.Do.pipe(
        Given('a bare string document')('input', () => Effect.succeed('"just a string"')),
        When('the tsconfig is parsed')(
          'failure',
          (s) => Effect.sync(() => failureOf(parseTsConfig('tsconfig.json', s.input))),
        ),
        Then('the shape error names the mismatch')((s) => {
          expect(s.failure).toBeInstanceOf(TsConfigParseError)
          expect(s.failure.file).toBe('tsconfig.json')
          expect(s.failure.reason).toContain('does not match the tsconfig shape')
        }),
      ),
    )

    scenario(
      'Should_RejectANumberRoot_When_TheDocumentIsNotAnObject',
      Gherkin.Do.pipe(
        Given('a numeric document')('input', () => Effect.succeed('42')),
        When('the tsconfig is parsed')('outcome', (s) => Effect.sync(() => parseTsConfig('tsconfig.json', s.input))),
        Then('the parse is a failure')((s) => {
          expect(Result.isFailure(s.outcome)).toBe(true)
        }),
      ),
    )

    scenario(
      'Should_RejectAMismatchedShape_When_ReferencesIsAString',
      Gherkin.Do.pipe(
        Given('a document whose references entry is a string')(
          'input',
          () => Effect.succeed('{ "references": "nope" }'),
        ),
        When('the tsconfig is parsed')('outcome', (s) => Effect.sync(() => parseTsConfig('tsconfig.json', s.input))),
        Then('the parse is a failure')((s) => {
          expect(Result.isFailure(s.outcome)).toBe(true)
        }),
      ),
    )

    scenario(
      'Should_AcceptAnEmptyObject_When_NoConfigurationIsGiven',
      Gherkin.Do.pipe(
        Given('an empty document')('input', () => Effect.succeed('{}')),
        Then('the empty object is the parsed config')(() => {
          expect(expectRight(parseTsConfig('tsconfig.json', '{}'))).toEqual({})
        }),
      ),
    )

    scenario(
      'Should_RoundTripADoubleBackslash_When_ItIsFollowedByACommentSlash',
      Gherkin.Do.pipe(
        Given('a paths value with an escaped backslash before a // marker')(
          'input',
          () => Effect.succeed('{"paths":{"a":["C:\\\\x//y"]}}'),
        ),
        When('the tsconfig is parsed')(
          'config',
          (s) => Effect.sync(() => expectRight(parseTsConfig('tsconfig.json', s.input))),
        ),
        Then('the raw value round-trips')((s) => {
          expect(s.config).toEqual({ paths: { a: ['C:\\x//y'] } })
        }),
      ),
    )

    scenario(
      'Should_RoundTripAnEscapedQuote_When_AStringContainsOne',
      Gherkin.Do.pipe(
        Given('a string containing escaped quotes')(
          'input',
          () => Effect.succeed('{"a":"he said \\"hi\\""}'),
        ),
        When('the tsconfig is parsed')(
          'config',
          (s) => Effect.sync(() => expectRight(parseTsConfig('tsconfig.json', s.input))),
        ),
        Then('the quoted text round-trips')((s) => {
          expect(s.config).toEqual({ a: 'he said "hi"' })
        }),
      ),
    )

    scenario(
      'Should_ParseABomPrefixedDocument_When_TheSameValueHasNoBom',
      Gherkin.Do.pipe(
        Given('a document body')('body', () => Effect.succeed('{\n  // comment\n  "a": 1\n}')),
        When('the body is parsed with and without a BOM')('values', (s) =>
          Effect.sync(() => ({
            withBom: expectRight(parseTsConfig('tsconfig.json', `\uFEFF${s.body}`)),
            withoutBom: expectRight(parseTsConfig('tsconfig.json', s.body)),
          }))),
        Then('both produce the same tsconfig')((s) => {
          expect(s.values.withBom).toEqual(s.values.withoutBom)
        }),
      ),
    )

    scenario(
      'Should_KeepKeysTheSchemaDoesNotDeclare',
      Gherkin.Do.pipe(
        Given('a document with undeclared top-level keys')(
          'input',
          () =>
            Effect.succeed(
              JSON.stringify({
                $schema: 'https://json.schemastore.org/tsconfig',
                compilerOptions: { strict: true },
              }),
            ),
        ),
        When('the tsconfig is parsed')(
          'config',
          (s) => Effect.sync(() => expectRight(parseTsConfig('tsconfig.json', s.input))),
        ),
        Then('the undeclared keys are preserved verbatim')((s) => {
          expect(s.config).toEqual({
            $schema: 'https://json.schemastore.org/tsconfig',
            compilerOptions: { strict: true },
          })
          // The tsconfig index-signature lane must not smuggle Stryker option
          // names into the parsed document.
          expect(Object.keys(s.config)).not.toContain(tsconfigOptionNames[0])
        }),
      ),
    )
  })
