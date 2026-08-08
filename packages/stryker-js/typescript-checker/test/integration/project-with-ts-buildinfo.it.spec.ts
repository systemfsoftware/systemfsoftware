import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

import type { Location, Mutant, StrykerOptions } from '@stryker-mutator/api/core'
import type { Logger } from '@stryker-mutator/api/logging'
import { describe, expect, it } from 'vitest'

import { HybridFileSystem } from '../../src/project/hybrid-file-system.js'
import { TypescriptChecker } from '../../src/typescript-checker.js'
import { TypescriptCompiler } from '../../src/typescript-compiler.js'

const resolveTestResource = path.resolve.bind(
  path,
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'testResources',
  'project-with-ts-buildinfo',
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

describe('project-with-ts-buildinfo', () => {
  it('should load project on init', async () => {
    const sut = createChecker(resolveTestResource('tsconfig.json'))
    await sut.init()
    const group = await sut.group([createMutant('src/index.ts', '', '')])
    expect(group).toHaveLength(1)
    // @ts-expect-error private close method
    sut.tsCompiler.close()
  })
})

const fileContents: Record<string, string> = Object.freeze({
  ['src/index.ts']: fs.readFileSync(
    resolveTestResource('src', 'index.ts'),
    'utf8',
  ),
})

function createMutant(
  fileName: 'src/index.ts',
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
