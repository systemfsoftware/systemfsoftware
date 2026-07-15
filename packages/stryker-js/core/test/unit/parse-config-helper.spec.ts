import { describe, expect, it } from 'vitest'
import { parseConfigFileTextToJson, stripJsonComments } from '../../src/sandbox/parse-config-helper.js'

describe('stripJsonComments', () => {
  it('removes block comments (/* comment */)', () => {
    const input = '{ "a": /* inner */ 1 }'
    const result = stripJsonComments(input)
    expect(result).toBe('{ "a":  1 }')
  })

  it('removes line comments (// comment)', () => {
    const input = '{\n  // a comment\n  "a": 1\n}'
    const result = stripJsonComments(input)
    expect(result).toBe('{\n  \n  "a": 1\n}')
  })
})

describe('parseConfigFileTextToJson', () => {
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
})
