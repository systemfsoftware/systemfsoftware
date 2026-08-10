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
  'project-references',
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

describe('Typescript checker on a project with project references', () => {
  let sut: TypescriptChecker

  beforeEach(() => {
    sut = createChecker(resolveTestResource('tsconfig.root.json'))
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

  it('should be able to validate a mutant', async () => {
    const mutant = createMutant('job.ts', 'Starting job', 'stryker was here')
    const actualResult = await sut.check([mutant])
    expect(actualResult[mutant.id]!).toEqual({ status: CheckStatus.Passed })
  })

  it('should allow unused local variables (override options)', async () => {
    const mutant = createMutant(
      'job.ts',
      'toUpperCase(logText)',
      'toUpperCase("")',
    )
    const actual = await sut.check([mutant])
    expect(actual[mutant.id]!).toEqual({ status: CheckStatus.Passed })
  })

  it('should create multiple groups if reference between project', async () => {
    const mutantInSourceProject = createMutant(
      'job.ts',
      'Starting job',
      '',
      '42',
    )
    const mutantInProjectWithReference = createMutant(
      'text.ts',
      'toUpperCase()',
      'toLowerCase()',
      '43',
    )
    const mutantOutsideOfReference = createMutant(
      'math.ts',
      'array.length',
      '1',
      '44',
    )
    const result = await sut.group([
      mutantInSourceProject,
      mutantInProjectWithReference,
      mutantOutsideOfReference,
    ])
    expect(result).toHaveLength(2)
  })
})

const fileContents: Record<string, string> = Object.freeze({
  ['index.ts']: fs.readFileSync(resolveTestResource('src', 'index.ts'), 'utf8'),
  ['job.ts']: fs.readFileSync(resolveTestResource('src', 'job.ts'), 'utf8'),
  ['math.ts']: fs.readFileSync(resolveTestResource('utils', 'math.ts'), 'utf8'),
  ['text.ts']: fs.readFileSync(resolveTestResource('utils', 'text.ts'), 'utf8'),
})

function createMutant(
  fileName: 'index.ts' | 'job.ts' | 'math.ts' | 'text.ts',
  findText: string,
  replacement: string,
  id = '42',
  offset = 0,
): Mutant {
  const lines = fileContents[fileName]!.split('\n')
  const lineNumber = lines.findIndex((l) => l.includes(findText))
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
