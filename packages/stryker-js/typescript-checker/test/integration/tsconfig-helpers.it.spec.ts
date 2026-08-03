import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

import { afterEach, describe, expect, it } from 'vitest'

import { determineBuildModeEnabled, overrideOptions, parseConfigFileTextToJson } from '../../src/tsconfig-helpers.js'

describe('parseConfigFileTextToJson', () => {
  it('should preserve a glob pattern in include exactly', () => {
    const result = parseConfigFileTextToJson(
      'tsconfig.json',
      '{"include":["src/**/*.workflow.ts"]}',
    )
    expect(result.error).toBeUndefined()
    expect(result.config).toEqual({ include: ['src/**/*.workflow.ts'] })
  })

  it('should round-trip a $schema URL unchanged', () => {
    const result = parseConfigFileTextToJson(
      'tsconfig.json',
      '{"$schema":"https://json.schemastore.org/tsconfig"}',
    )
    expect(result.error).toBeUndefined()
    expect(result.config).toEqual({
      $schema: 'https://json.schemastore.org/tsconfig',
    })
  })

  it('should round-trip a Windows path and an escaped quote unchanged', () => {
    const result = parseConfigFileTextToJson(
      'tsconfig.json',
      '{"paths":{"a":["C:\\\\x//y"]},"description":"he said \\"hi\\""}',
    )
    expect(result.error).toBeUndefined()
    expect(result.config).toEqual({
      paths: { a: ['C:\\x//y'] },
      description: 'he said "hi"',
    })
  })

  it('should accept trailing commas in nested objects and arrays', () => {
    const result = parseConfigFileTextToJson(
      'tsconfig.json',
      '{"compilerOptions":{"strict":true,},"include":["a.ts","b.ts",]}',
    )
    expect(result.error).toBeUndefined()
    expect(result.config).toEqual({
      compilerOptions: { strict: true },
      include: ['a.ts', 'b.ts'],
    })
  })

  it('should accept content prefixed with a BOM', () => {
    const withoutBom = parseConfigFileTextToJson(
      'tsconfig.json',
      '{"compilerOptions":{"strict":true}}',
    )
    const withBom = parseConfigFileTextToJson(
      'tsconfig.json',
      '\uFEFF{"compilerOptions":{"strict":true}}',
    )
    expect(withBom.error).toBeUndefined()
    expect(withBom.config).toEqual(withoutBom.config)
  })

  it('should strip line and block comments', () => {
    const result = parseConfigFileTextToJson(
      'tsconfig.json',
      '{\n// a line comment\n"a": 1,\n/* a block comment */\n"b": 2\n}',
    )
    expect(result.error).toBeUndefined()
    expect(result.config).toEqual({ a: 1, b: 2 })
  })

  it('should return an error for a malformed document', () => {
    const result = parseConfigFileTextToJson('tsconfig.json', '{ "a": }')
    expect(result.error).toBeInstanceOf(Error)
    expect(result.config).toBeUndefined()
  })

  it('should return an error for truncated input', () => {
    for (const truncated of ['{', '{"a":']) {
      const result = parseConfigFileTextToJson('tsconfig.json', truncated)
      expect(result.error).toBeInstanceOf(Error)
      expect(result.config).toBeUndefined()
    }
  })

  it('should return an error for an unterminated block comment', () => {
    const result = parseConfigFileTextToJson(
      'tsconfig.json',
      '{"a":1,/* never closed',
    )
    expect(result.error).toBeInstanceOf(Error)
    expect(result.config).toBeUndefined()
  })
})

describe('overrideOptions', () => {
  it('should ignore a string config instead of spreading it to character indices', () => {
    const parsed = JSON.parse(overrideOptions({ config: 'abc' }, false))
    expect(Object.keys(parsed)).toEqual(['compilerOptions'])
    expect(parsed.compilerOptions).toMatchObject({
      allowUnreachableCode: true,
      noEmit: true,
      target: 'es2022',
      moduleResolution: 'bundler',
    })
  })

  it('should ignore an array config instead of spreading it to indices', () => {
    const parsed = JSON.parse(overrideOptions({ config: ['a', 'b'] }, false))
    expect(Object.keys(parsed)).toEqual(['compilerOptions'])
    expect(parsed.compilerOptions).toMatchObject({
      allowUnreachableCode: true,
      noEmit: true,
      target: 'es2022',
      moduleResolution: 'bundler',
    })
  })
})

describe('determineBuildModeEnabled', () => {
  let tempDir: string | undefined

  afterEach(() => {
    if (tempDir !== undefined) {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  function createTsconfig(content: string): string {
    tempDir = mkdtempSync(path.join(tmpdir(), 'tsconfig-helpers-'))
    const tsconfigPath = path.join(tempDir, 'tsconfig.json')
    writeFileSync(tsconfigPath, content)
    return tsconfigPath
  }

  it('should return true when the config has references', () => {
    const tsconfigPath = createTsconfig('{"references":[{"path":"./a"}]}')
    expect(determineBuildModeEnabled(tsconfigPath)).toBe(true)
  })

  it('should return false when the config has no references', () => {
    const tsconfigPath = createTsconfig('{"compilerOptions":{"strict":true}}')
    expect(determineBuildModeEnabled(tsconfigPath)).toBe(false)
  })
})
