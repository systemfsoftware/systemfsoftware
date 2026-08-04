import { Either } from 'effect'
import { describe, expect, it } from 'vitest'

import { parseTsConfig, TsConfigParseError } from '../../src/sandbox/parse-config-helper.js'

function expectRight<A>(either: Either.Either<A, TsConfigParseError>): A {
  if (Either.isLeft(either)) {
    throw new Error(`Expected a Right result, got a Left: ${String(either.left)}`)
  }
  return either.right
}

describe('parseTsConfig', () => {
  it('parses block comments (/* comment */)', () => {
    const input = '{ "a": /* inner */ 1 }'
    const config = expectRight(parseTsConfig('tsconfig.json', input))
    expect(config).toEqual({ a: 1 })
  })

  it('parses line comments (// comment)', () => {
    const input = '{\n  // a comment\n  "a": 1\n}'
    const config = expectRight(parseTsConfig('tsconfig.json', input))
    expect(config).toEqual({ a: 1 })
  })

  it('with valid JSON with comments returns the parsed object', () => {
    const input = '{\n  // comment\n  "a": 1,\n  "b": "two"\n}'
    const config = expectRight(parseTsConfig('tsconfig.json', input))
    expect(config).toEqual({ a: 1, b: 'two' })
  })

  it('with malformed JSON returns a Left TsConfigParseError', () => {
    const result = parseTsConfig('tsconfig.json', '{ "a": }')
    expect(Either.isLeft(result)).toBe(true)
    if (Either.isLeft(result)) {
      expect(result.left).toBeInstanceOf(TsConfigParseError)
      expect(result.left.file).toBe('tsconfig.json')
      expect(result.left.reason.length).toBeGreaterThan(0)
    }
  })

  it('with empty input returns a Left TsConfigParseError', () => {
    const result = parseTsConfig('tsconfig.json', '')
    expect(Either.isLeft(result)).toBe(true)
    if (Either.isLeft(result)) {
      expect(result.left).toBeInstanceOf(TsConfigParseError)
      expect(result.left.file).toBe('tsconfig.json')
      expect(result.left.reason.length).toBeGreaterThan(0)
    }
  })

  it('with a bare string root returns a Left (a tsconfig must be an object)', () => {
    const result = parseTsConfig('tsconfig.json', '"just a string"')
    expect(Either.isLeft(result)).toBe(true)
    if (Either.isLeft(result)) {
      expect(result.left).toBeInstanceOf(TsConfigParseError)
      expect(result.left.file).toBe('tsconfig.json')
      expect(result.left.reason).toContain('does not match the tsconfig shape')
    }
  })

  it('with a number root returns a Left', () => {
    const result = parseTsConfig('tsconfig.json', '42')
    expect(Either.isLeft(result)).toBe(true)
  })

  it('with a mismatched shape (references as a string) returns a Left', () => {
    const result = parseTsConfig('tsconfig.json', '{ "references": "nope" }')
    expect(Either.isLeft(result)).toBe(true)
  })

  it('accepts an empty object (an empty tsconfig is valid)', () => {
    const config = expectRight(parseTsConfig('tsconfig.json', '{}'))
    expect(config).toEqual({})
  })

  it('round-trips a paths value containing a double backslash followed by //', () => {
    // Pins core's shipped defect: the old scanner dropped the escape target, so this input threw `Bad escaped character in JSON`.
    const input = '{"paths":{"a":["C:\\\\x//y"]}}'
    const config = expectRight(parseTsConfig('tsconfig.json', input))
    expect(config).toEqual({ paths: { a: ['C:\\x//y'] } })
  })

  it('round-trips a string containing an escaped quote', () => {
    // Same defect: the escaped `\"` lost its escape target and JSON.parse threw `Bad escaped character in JSON`.
    const input = '{"a":"he said \\"hi\\""}'
    const config = expectRight(parseTsConfig('tsconfig.json', input))
    expect(config).toEqual({ a: 'he said "hi"' })
  })

  it('parses content prefixed with a BOM to the same value as without it', () => {
    const withoutBom = '{\n  // comment\n  "a": 1\n}'
    const config = expectRight(
      parseTsConfig('tsconfig.json', `\uFEFF${withoutBom}`),
    )
    expect(config).toEqual(
      expectRight(parseTsConfig('tsconfig.json', withoutBom)),
    )
  })

  it('keeps keys the schema does not declare (index signature)', () => {
    const input = {
      $schema: 'https://json.schemastore.org/tsconfig',
      compilerOptions: { strict: true },
    }
    const config = expectRight(
      parseTsConfig('tsconfig.json', JSON.stringify(input)),
    )
    expect(config).toEqual(input)
  })
})
