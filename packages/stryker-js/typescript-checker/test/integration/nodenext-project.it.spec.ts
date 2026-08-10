import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

import { CheckStatus } from '@systemfsoftware/stryker-js-plugin-api/check'
import type { Location, Mutant, StrykerOptions } from '@systemfsoftware/stryker-js-plugin-api/core'
import type { Logger } from '@systemfsoftware/stryker-js-plugin-api/logging'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { HybridFileSystem } from '../../src/project/hybrid-file-system.js'
import { TypescriptChecker } from '../../src/typescript-checker.js'
import { TypescriptCompiler } from '../../src/typescript-compiler.js'

const resolveTestResource = path.resolve.bind(
  path,
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'testResources',
  'nodenext-project',
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

const utilSource = fs.readFileSync(resolveTestResource('src', 'util.ts'), 'utf8')

function createMutant(
  findText: string,
  replacement: string,
  id: string,
): Mutant {
  const lines = utilSource.split('\n')
  const lineNumber = lines.findIndex((line) => line.includes(findText))
  if (lineNumber === -1) {
    throw new Error(`Cannot find ${findText} in util.ts`)
  }
  const column = lines[lineNumber]!.indexOf(findText)
  const location: Location = {
    start: { line: lineNumber, column },
    end: { line: lineNumber, column: column + findText.length },
  }
  return {
    id,
    fileName: resolveTestResource('src', 'util.ts'),
    mutatorName: 'test-mutator',
    location,
    replacement,
  }
}

describe('Typescript checker on a NodeNext project targeting es2024', () => {
  let sut: TypescriptChecker

  beforeEach(() => {
    sut = createChecker(resolveTestResource('tsconfig.json'))
    return sut.init()
  })

  afterEach(() => {
    // @ts-expect-error private close method
    sut.tsCompiler.close()
  })

  it('should validate a mutant that keeps the project compiling', async () => {
    const mutant = createMutant('value % 2 === 0', 'value % 2 !== 0', 'passing')
    const actual = await sut.check([mutant])
    expect(actual).toEqual({ passing: { status: CheckStatus.Passed } })
  })

  it('should invalidate a mutant that violates the declared return type', async () => {
    const mutant = createMutant("'even'", '42', 'breaking')
    const actual = await sut.check([mutant])
    expect(actual['breaking']!.status).toBe(CheckStatus.CompileError)
  })
})
