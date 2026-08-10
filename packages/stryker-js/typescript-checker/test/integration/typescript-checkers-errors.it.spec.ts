import path from 'path'
import { fileURLToPath } from 'url'

import type { StrykerOptions } from '@systemfsoftware/stryker-js-plugin-api/core'
import type { Logger } from '@systemfsoftware/stryker-js-plugin-api/logging'
import { describe, expect, it, vi } from 'vitest'

import { HybridFileSystem } from '../../src/project/hybrid-file-system.js'
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

function createLogger(warn: Logger['warn'] = () => {}): Logger {
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
    warn,
    error: () => {},
    fatal: () => {},
  }
}

function createChecker(
  tsconfigFile: string,
  logger: Logger = createLogger(),
): TypescriptChecker {
  const options = {
    tsconfigFile,
    typescriptChecker: { prioritizePerformanceOverAccuracy: true },
  } as unknown as StrykerOptions
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
  }, 30_000)

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

  it('should log a warning naming the tsconfig path and the skipped-overrides consequence when parsing falls back', async () => {
    const warn = vi.fn()
    const sut = createChecker(
      resolveTestResource('invalid-tsconfig', 'tsconfig.json'),
      createLogger(warn),
    )

    await expect(sut.init()).rejects.toThrow(
      'testResources/errors/invalid-tsconfig/tsconfig.json(1,1): error TS1005:',
    )

    expect(warn).toHaveBeenCalled()
    const warnings = warn.mock.calls
      .map((call) => call.join(' '))
      .join('\n')
    expect(warnings).toContain(
      'testResources/errors/invalid-tsconfig/tsconfig.json',
    )
    expect(warnings.toLowerCase()).toContain(
      'compiler-option overrides and project-reference walking were skipped',
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
