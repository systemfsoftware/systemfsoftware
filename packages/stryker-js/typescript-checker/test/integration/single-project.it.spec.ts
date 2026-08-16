import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

import { CheckStatus } from '@systemfsoftware/stryker-js-plugin-api/check'
import type { FailedCheckResult } from '@systemfsoftware/stryker-js-plugin-api/check'
import type { Location, Mutant, StrykerOptions } from '@systemfsoftware/stryker-js-plugin-api/core'
import type { Logger } from '@systemfsoftware/stryker-js-plugin-api/logging'
import { Result } from 'effect'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { HybridFileSystem } from '../../src/project/hybrid-file-system.js'
import { overrideOptions, parseTsConfig } from '../../src/tsconfig-helpers.js'
import { TypescriptChecker } from '../../src/typescript-checker.js'
import { TypescriptCompiler } from '../../src/typescript-compiler.js'

const resolveTestResource = path.resolve.bind(
  path,
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'testResources',
  'single-project',
) as unknown as typeof path.resolve

function createLogger(): Logger {
  return {
    isTraceEnabled: () => false,
    isDebugEnabled: () => false,
    isInfoEnabled: () => false,
    isWarnEnabled: () => false,
    isErrorEnabled: () => false,
    isFatalEnabled: () => false,
    trace: () => {},
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    fatal: () => {},
  }
}

function createChecker(tsconfigFile: string): TypescriptChecker {
  const options = {
    tsconfigFile,
    typescriptChecker: { prioritizePerformanceOverAccuracy: true },
  } as unknown as StrykerOptions
  const logger = createLogger()
  const fileSystem = new HybridFileSystem()
  const compiler = new TypescriptCompiler(logger, options, fileSystem)
  return new TypescriptChecker(logger, options, compiler)
}

describe('Typescript checker on a single project', () => {
  let sut: TypescriptChecker

  beforeEach(() => {
    sut = createChecker(resolveTestResource('tsconfig.json'))
    return sut.init()
  })

  afterEach(() => {
    // @ts-expect-error private close method
    sut.tsCompiler.close()
  })

  it('should not write output to disk', () => {
    expect(
      fs.existsSync(resolveTestResource('dist')),
      'Output was written to disk!',
    ).toBe(false)
  })

  it('should be able to validate a mutant that does not result in an error', async () => {
    const mutant = createMutant(
      'todo.ts',
      'TodoList.allTodos.push(newItem)',
      'newItem? 42: 43',
      '42',
    )
    const actual = await sut.check([mutant])
    expect(actual).toEqual({ '42': { status: CheckStatus.Passed } })
  })

  it('should be able invalidate a mutant that does result in a compile error', async () => {
    const mutant = createMutant(
      'todo.ts',
      'TodoList.allTodos.push(newItem)',
      '"This should not be a string 🙄"',
      'mutId',
    )
    const actual = await sut.check([mutant])
    expect(actual['mutId']!.status).toBe(CheckStatus.CompileError)
    expect((actual['mutId'] as FailedCheckResult).reason).toContain(
      'todo.ts(15,9): error TS2322',
    )
  })

  it('should be able validate a mutant that does not result in a compile error after a compile error', async () => {
    const mutantCompileError = createMutant(
      'todo.ts',
      'TodoList.allTodos.push(newItem)',
      '"This should not be a string 🙄"',
    )
    const mutantWithoutError = createMutant(
      'todo.ts',
      'return TodoList.allTodos',
      '[]',
      'mut42',
      7,
    )

    await sut.check([mutantCompileError])
    const actual = await sut.check([mutantWithoutError])

    expect(actual).toEqual({ mut42: { status: CheckStatus.Passed } })
  })

  it('should be able to invalidate a mutant that results in an error in a different file', async () => {
    const actual = await sut.check([
      createMutant('todo.ts', 'return totalCount', '', '42'),
    ])
    expect(actual['42']!.status).toBe(CheckStatus.CompileError)
    expect((actual['42'] as FailedCheckResult).reason).toContain(
      'todo.spec.ts(4,7): error TS2322',
    )
  })

  it('should be able to validate a mutant after a mutant in a different file resulted in a transpile error', async () => {
    await sut.check([createMutant('todo.ts', 'return totalCount', '')])
    const result = await sut.check([
      createMutant(
        'todo.spec.ts',
        "'Mow lawn'",
        "'this is valid, right?'",
        'id42',
      ),
    ])

    expect(result).toEqual({ id42: { status: CheckStatus.Passed } })
  })

  it('should be allow mutations in unrelated files', async () => {
    const result = await sut.check([
      createMutant('not-type-checked.js', 'bar', 'baz', 'id1'),
    ])

    expect(result).toEqual({ id1: { status: CheckStatus.Passed } })
  })

  it('should allow unused local variables (override options)', async () => {
    const mutant = createMutant(
      'todo.ts',
      'TodoList.allTodos.push(newItem)',
      '42',
      'id45',
    )
    const actual = await sut.check([mutant])
    expect(actual).toEqual({ id45: { status: CheckStatus.Passed } })
  })

  it('should be able invalidate 2 mutants that do result in a compile errors', async () => {
    const mutant = createMutant(
      'todo.ts',
      'TodoList.allTodos.push(newItem)',
      '"This should not be a string 🙄"',
      'mutId',
    )
    const mutant2 = createMutant(
      'counter.ts',
      'return this.currentNumber',
      'return "This should not return a string 🙄"',
      'mutId2',
    )
    const actual = await sut.check([mutant, mutant2])
    expect(actual['mutId']!.status).toBe(CheckStatus.CompileError)
    expect(actual['mutId2']!.status).toBe(CheckStatus.CompileError)
    expect((actual['mutId'] as FailedCheckResult).reason).toContain(
      'todo.ts(15,9): error TS2322',
    )
    expect((actual['mutId2'] as FailedCheckResult).reason).toContain(
      'counter.ts(7,5): error TS2322',
    )
  })

  it('should be able invalidate 2 mutants that do result in a compile error in file above', async () => {
    const mutant = createMutant(
      'errorInFileAbove2Mutants/todo.ts',
      'TodoList.allTodos.push(newItem)',
      '"This should not be a string 🙄"',
      'mutId',
    )
    const mutant2 = createMutant(
      'errorInFileAbove2Mutants/counter.ts',
      'return (this.currentNumber += numberToIncrementBy)',
      'return "This should not return a string 🙄"',
      'mutId2',
    )
    const actual = await sut.check([mutant, mutant2])
    expect(actual['mutId']!.status).toBe(CheckStatus.CompileError)
    expect(actual['mutId2']!.status).toBe(CheckStatus.CompileError)
    expect((actual['mutId'] as FailedCheckResult).reason).toContain(
      'todo.ts(15,9): error TS2322',
    )
    expect((actual['mutId2'] as FailedCheckResult).reason).toContain(
      'errorInFileAbove2Mutants/todo-counter.ts(7,7): error TS2322',
    )
  })

  it('should compile the fixture source files discovered via the ** include glob', async () => {
    // The fixture tsconfig selects its inputs via `include: ["src/**/*.ts"]`. If a comment
    // stripper corrupted the glob (the `/**/` inside it looks like an empty block comment),
    // TypeScript would find no input files and abort init with TS18003, so this assertion
    // pins the end-to-end regression against the real checker path.
    const mutant = createMutant(
      'errorInFileAbove2Mutants/todo.ts',
      'TodoList.allTodos.push(newItem)',
      '"This should not be a string 🙄"',
      'glob-pin',
    )
    const actual = await sut.check([mutant])
    expect(actual['glob-pin']?.status).toBe(CheckStatus.CompileError)
    expect((actual['glob-pin'] as FailedCheckResult).reason).toContain(
      'todo.ts(15,9): error TS2322',
    )
  })

  it('should preserve the fixture $schema URL and ** glob in the config produced by overrideOptions', () => {
    // `$schema` holds a `//`-bearing string and `include` holds a `**` glob: the two shapes a
    // naive comment stripper mangles. The compiler feeds the output of `overrideOptions` to
    // TypeScript, so this asserts both survive byte-for-byte into that config.
    const tsconfigFile = resolveTestResource('tsconfig.json')
    const content = fs.readFileSync(tsconfigFile, 'utf8')
    const parsed = parseTsConfig(tsconfigFile, content)
    if (Result.isFailure(parsed)) {
      throw new Error(`Expected fixture tsconfig to parse, got: ${parsed.failure.reason}`)
    }
    const config = overrideOptions(parsed.success, false)
    expect(config).toContain('"$schema":"https://json.schemastore.org/tsconfig"')
    expect(config).toContain('"include":["src/**/*.ts"]')
  })
})

const fileContents: Record<string, string> = Object.freeze({
  ['errorInFileAbove2Mutants/todo.ts']: fs.readFileSync(
    resolveTestResource('src', 'errorInFileAbove2Mutants', 'todo.ts'),
    'utf8',
  ),
  ['errorInFileAbove2Mutants/counter.ts']: fs.readFileSync(
    resolveTestResource('src', 'errorInFileAbove2Mutants', 'counter.ts'),
    'utf8',
  ),
  ['todo.ts']: fs.readFileSync(resolveTestResource('src', 'todo.ts'), 'utf8'),
  ['counter.ts']: fs.readFileSync(
    resolveTestResource('src', 'counter.ts'),
    'utf8',
  ),
  ['todo.spec.ts']: fs.readFileSync(
    resolveTestResource('src', 'todo.spec.ts'),
    'utf8',
  ),
  ['not-type-checked.js']: fs.readFileSync(
    resolveTestResource('src', 'not-type-checked.js'),
    'utf8',
  ),
})

function createMutant(
  fileName:
    | 'counter.ts'
    | 'errorInFileAbove2Mutants/counter.ts'
    | 'errorInFileAbove2Mutants/todo.ts'
    | 'not-type-checked.js'
    | 'todo.spec.ts'
    | 'todo.ts',
  findText: string,
  replacement: string,
  id = '42',
  offset = 0,
): Mutant {
  const lines = fileContents[fileName]!.split('\n')
  const lineNumber = lines.findIndex((line) => line.includes(findText))
  if (lineNumber === -1) {
    throw new Error(`Cannot find ${findText} in ${fileName}`)
  }
  const textColumn = lines[lineNumber]!.indexOf(findText)
  const location: Location = {
    start: { line: lineNumber, column: textColumn + offset },
    end: { line: lineNumber, column: textColumn + findText.length },
  }
  return {
    id,
    fileName: resolveTestResource('src', fileName),
    mutatorName: 'foo-mutator',
    location,
    replacement,
  }
}
