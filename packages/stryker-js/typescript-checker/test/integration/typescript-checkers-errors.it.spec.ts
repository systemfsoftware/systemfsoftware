import path from 'path'
import { fileURLToPath } from 'url'

import type { StrykerOptions } from '@stryker-mutator/api/core'
import type { Logger } from '@stryker-mutator/api/logging'
import { describe, expect, it } from 'vitest'

import { HybridFileSystem } from '../../src/fs/hybrid-file-system.js'
import { TypescriptChecker } from '../../src/typescript-checker.js'
import { TypescriptCompiler } from '../../src/typescript-compiler.js'

const resolveTestResource = path.resolve.bind(
  path,
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'testResources',
  'errors',
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

describe('Typescript checker errors', () => {
  it('should reject initialization if initial compilation failed', async () => {
    const sut = createChecker(
      resolveTestResource('compile-error', 'tsconfig.json'),
    )
    await expect(sut.init()).rejects.toThrow(
      'Typescript error(s) found in dry run compilation:',
    )
    await expect(sut.init()).rejects.toThrow(
      'testResources/errors/compile-error/add.ts(2,3): error TS2322:',
    )
  })

  it('should reject initialization if tsconfig was invalid', async () => {
    const sut = createChecker(
      resolveTestResource('invalid-tsconfig', 'tsconfig.json'),
    )
    await expect(sut.init()).rejects.toThrow(
      'Typescript error(s) found in dry run compilation:',
    )
    await expect(sut.init()).rejects.toThrow(
      'testResources/errors/invalid-tsconfig/tsconfig.json(1,1): error TS1005:',
    )
  })

  it("should reject when tsconfig file doesn't exist", async () => {
    const sut = createChecker(
      resolveTestResource('empty-dir', 'tsconfig.json'),
    )
    await expect(sut.init()).rejects.toThrow(
      `The tsconfig file does not exist at: "${
        resolveTestResource(
          'empty-dir',
          'tsconfig.json',
        )
      }". Please configure the tsconfig file in your stryker.conf file using "tsconfigFile"`,
    )
  })
})
