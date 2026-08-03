import { describe, expect, it } from 'vitest'
import { parseConfigFileTextToJson } from '../../src/sandbox/parse-config-helper.js'

describe('parseConfigFileTextToJson', () => {
  it('parses block comments (/* comment */)', () => {
    const input = '{ "a": /* inner */ 1 }'
    const result = parseConfigFileTextToJson('tsconfig.json', input)
    expect(result.error).toBeUndefined()
    expect(result.config).toEqual({ a: 1 })
  })

  it('parses line comments (// comment)', () => {
    const input = '{\n  // a comment\n  "a": 1\n}'
    const result = parseConfigFileTextToJson('tsconfig.json', input)
    expect(result.error).toBeUndefined()
    expect(result.config).toEqual({ a: 1 })
  })

  it('with valid JSON with comments returns {config} with the parsed object', () => {
    const input = '{\n  // comment\n  "a": 1,\n  "b": "two"\n}'
    const result = parseConfigFileTextToJson('tsconfig.json', input)
    expect(result.error).toBeUndefined()
    expect(result.config).toEqual({ a: 1, b: 'two' })
  })

  it('with malformed JSON returns {error} containing a SyntaxError', () => {
    const input = '{ "a": }'
    const result = parseConfigFileTextToJson('tsconfig.json', input)
    expect(result.config).toBeUndefined()
    expect(result.error).toBeInstanceOf(SyntaxError)
  })

  it('with empty input returns {error}', () => {
    const result = parseConfigFileTextToJson('tsconfig.json', '')
    expect(result.config).toBeUndefined()
    expect(result.error).toBeInstanceOf(SyntaxError)
  })

  it('round-trips a paths value containing a double backslash followed by //', () => {
    // Pins core's shipped defect: the old scanner dropped the escape target, so this input threw `Bad escaped character in JSON`.
    const input = '{"paths":{"a":["C:\\\\x//y"]}}'
    const result = parseConfigFileTextToJson('tsconfig.json', input)
    expect(result.error).toBeUndefined()
    expect(result.config).toEqual({ paths: { a: ['C:\\x//y'] } })
  })

  it('round-trips a string containing an escaped quote', () => {
    // Same defect: the escaped `\"` lost its escape target and JSON.parse threw `Bad escaped character in JSON`.
    const input = '{"a":"he said \\"hi\\""}'
    const result = parseConfigFileTextToJson('tsconfig.json', input)
    expect(result.error).toBeUndefined()
    expect(result.config).toEqual({ a: 'he said "hi"' })
  })

  it('parses content prefixed with a BOM to the same value as without it', () => {
    const withoutBom = '{\n  // comment\n  "a": 1\n}'
    const result = parseConfigFileTextToJson('tsconfig.json', `\uFEFF${withoutBom}`)
    expect(result.error).toBeUndefined()
    expect(result.config).toEqual(parseConfigFileTextToJson('tsconfig.json', withoutBom).config)
  })
})
