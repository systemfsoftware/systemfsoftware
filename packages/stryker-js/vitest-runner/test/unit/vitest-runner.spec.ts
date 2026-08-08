import type { Logger } from '@stryker-mutator/api/logging'
import { TestRunnerCapabilities } from '@stryker-mutator/api/test-runner'
import fs from 'fs'
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest'
import type { Vitest } from 'vitest/node'

import { VITEST_ERROR_CODES } from '../../src/vitest-helpers.js'
import type { VitestRunnerOptionsWithStrykerOptions } from '../../src/vitest-runner-options-with-stryker-options.js'
import { VitestTestRunner } from '../../src/vitest-test-runner.js'
import type { ResolvedVitest, VitestResolver } from '../../src/vitest-wrapper.js'
import { createDryRunOptions, createLogger, createStrykerOptions, createVitestMock } from '../util/factories.js'

describe(VitestTestRunner.name, () => {
  let sut: VitestTestRunner
  let createVitestStub: Mock<ResolvedVitest['createVitest']>
  let vitestResolverStub: Mock<VitestResolver>
  let options: VitestRunnerOptionsWithStrykerOptions
  let vitestStub: Vitest
  let logger: Logger

  beforeEach(() => {
    logger = createLogger()
    options = createStrykerOptions()
    createVitestStub = vi.fn<ResolvedVitest['createVitest']>()
    vitestStub = createVitestMock()
    createVitestStub.mockResolvedValue(vitestStub)
    vitestResolverStub = vi.fn<VitestResolver>()
    vitestResolverStub.mockResolvedValue({
      createVitest: createVitestStub,
      version: '1.0.0',
    })
    sut = new VitestTestRunner(
      options,
      logger,
      '__stryker2__',
      vitestResolverStub,
    )
    vi.spyOn(fs.promises, 'copyFile').mockResolvedValue()
    vi.spyOn(fs.promises, 'rm').mockResolvedValue()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should declare reload capabilities', () => {
    // The files under test are cached between runs
    const expectedCapabilities: TestRunnerCapabilities = {
      reloadEnvironment: true,
    }
    expect(sut.capabilities()).toEqual(expectedCapabilities)
  })

  describe(VitestTestRunner.prototype.dispose.name, () => {
    it('should not throw when not initialized', async () => {
      await expect(sut.dispose()).resolves.toBeUndefined()
    })
  })

  describe(VitestTestRunner.prototype.init.name, () => {
    it('should initialize the vitest environment', async () => {
      await sut.init()

      expect(createVitestStub).toHaveBeenCalledExactlyOnceWith('test', {
        config: undefined,
        threads: true,
        pool: 'threads',
        coverage: { enabled: false },
        poolOptions: {
          threads: {
            maxThreads: 1,
            minThreads: 1,
          },
        },
        maxWorkers: 1,
        singleThread: false,
        maxConcurrency: 1,
        watch: false,
        dir: process.cwd(),
        bail: 1,
        onConsoleLog: expect.any(Function),
      })
    })

    it('should set the NODE_ENV environment variable', async () => {
      delete process.env.NODE_ENV

      await sut.init()

      expect(process.env.NODE_ENV).toBe('test')
    })
    it('should set the VITEST environment variable', async () => {
      delete process.env.VITEST

      await sut.init()

      expect(process.env.VITEST).toBe('1')
    })
  })

  describe(VitestTestRunner.prototype.dryRun.name, () => {
    beforeEach(async () => {
      await sut.init()
    })

    it('should set related to the mutated files', async () => {
      // Arrange
      vitestStub.config.related = undefined

      // Act
      await sut.dryRun(
        createDryRunOptions({ files: ['src/file.js', 'src/file2.js'] }),
      )

      // Assert
      expect(vitestStub.config.related).toEqual([
        'src/file.js',
        'src/file2.js',
      ])
    })

    it('should normalize file paths of related files', async () => {
      // Arrange
      vitestStub.config.related = undefined

      // Act
      await sut.dryRun(
        createDryRunOptions({ files: ['src\\file.js', 'src\\file2.js'] }),
      )

      // Assert
      expect(vitestStub.config.related).toEqual([
        'src/file.js',
        'src/file2.js',
      ])
    })

    it('should disable related when `vitest.related` is false', async () => {
      // Arrange
      options.vitest.related = false
      vitestStub.config.related = ['some', 'file']

      // Act
      await sut.dryRun(
        createDryRunOptions({ files: ['src/file.js', 'src/file2.js'] }),
      )

      // Assert
      expect(vitestStub.config.related).toBeUndefined()
    })

    it('should log a warning when `related` is enabled and no files could be found', async () => {
      // Arrange
      const actualError = new Error() as Error & { code: string }
      actualError.code = VITEST_ERROR_CODES.FILES_NOT_FOUND
      vi.mocked(vitestStub.start).mockRejectedValue(actualError)

      // Act
      await sut.dryRun(createDryRunOptions({ files: ['file.js'] }))

      // Assert
      expect(logger.warn).toHaveBeenCalledWith(
        'Vitest failed to find test files related to mutated files. Either disable `vitest.related` or import your source files directly from your test files. See https://stryker-mutator.io/docs/stryker-js/troubleshooting/#vitest-failed-to-find-test-files-related-to-mutated-files',
      )
    })

    it('should not log a warning when `related` is disabled and no files could be found', async () => {
      // Arrange
      const actualError = new Error() as Error & { code: string }
      actualError.code = VITEST_ERROR_CODES.FILES_NOT_FOUND
      vi.mocked(vitestStub.start).mockRejectedValue(actualError)
      options.vitest.related = false

      // Act
      await sut.dryRun(createDryRunOptions({ files: ['file.js'] }))

      // Assert
      expect(logger.warn).not.toHaveBeenCalled()
    })

    it('should run the given test files verbatim and skip the related-files warning', async () => {
      // Arrange
      vitestStub.config.related = undefined

      // Act
      await sut.dryRun(
        createDryRunOptions({
          files: ['src/file.js'],
          testFiles: ['tests/a.spec.ts'],
        }),
      )

      // Assert
      expect(vitestStub.start).toHaveBeenCalledWith(['tests/a.spec.ts'])
      expect(vitestStub.config.related).toEqual(['src/file.js'])
      expect(logger.warn).not.toHaveBeenCalled()
    })

    it('should propagate a start failure that is not a missing-test-files error', async () => {
      // Arrange
      vi.mocked(vitestStub.start).mockRejectedValue(new Error('config exploded'))

      // Act & Assert
      await expect(sut.dryRun(createDryRunOptions())).rejects.toThrow(
        'config exploded',
      )
    })
  })
})
