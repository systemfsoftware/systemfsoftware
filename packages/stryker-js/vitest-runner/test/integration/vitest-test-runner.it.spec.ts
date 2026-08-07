import path from 'path'

import { TestStatus } from '@stryker-mutator/api/test-runner'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createVitestTestRunnerFactory, VitestTestRunner } from '../../dist/index.mjs'
import { VitestRunnerOptionsWithStrykerOptions } from '../../src/vitest-runner-options-with-stryker-options.js'
import { expectCompleted, expectErrored, expectKilled, expectSurvived, expectTestResults } from '../util/assertions.js'
import {
  createDryRunOptions,
  createMutant,
  createMutantRunOptions,
  createStrykerOptions,
  createTestInjector,
  createVitestRunnerOptions,
} from '../util/factories.js'
import { TempTestDirectorySandbox } from '../util/temp-test-directory-sandbox.js'

describe('VitestRunner integration', () => {
  let sut: VitestTestRunner
  let sandbox: TempTestDirectorySandbox
  let options: VitestRunnerOptionsWithStrykerOptions

  beforeEach(() => {
    options = createStrykerOptions()
    sut = createTestInjector(options).injectFunction(
      createVitestTestRunnerFactory('__stryker2__'),
    )
    options.vitest = createVitestRunnerOptions({ related: false })
  })

  afterEach(async () => {
    await sut.dispose()
    await sandbox.dispose()
  })

  describe('using the simple-project project', () => {
    const test1 = 'tests/add.spec.ts#add should be able to add two numbers'
    const test2 = 'tests/add.spec.ts#add should be able to add a negative number'
    const test3 = 'tests/math.spec.ts#math should be able negate a number'
    const test4 = 'tests/math.spec.ts#math should be able to add one to a number'
    const test5 = 'tests/math.spec.ts#math should be able to recognize a negative number'
    const test6 = 'tests/pi.spec.ts#pi should be 3.14'
    let sandboxFileName: string

    beforeEach(async () => {
      sandbox = new TempTestDirectorySandbox('simple-project')
      await sandbox.init()
      sandboxFileName = path.resolve(sandbox.tmpDir, 'math.ts')
    })

    describe(VitestTestRunner.prototype.dryRun.name, () => {
      beforeEach(async () => {
        await sut.init()
      })

      it('should run the specs', async () => {
        const runResult = await sut.dryRun(createDryRunOptions())
        expectCompleted(runResult)
        expectTestResults(runResult, [
          {
            id: test1,
            fileName: path.resolve('tests/add.spec.ts'),
            name: 'add should be able to add two numbers',
            status: TestStatus.Success,
          },
          {
            id: test2,
            fileName: path.resolve('tests/add.spec.ts'),
            name: 'add should be able to add a negative number',
            status: TestStatus.Success,
          },
          {
            id: test3,
            fileName: path.resolve('tests/math.spec.ts'),
            name: 'math should be able negate a number',
            status: TestStatus.Success,
          },
          {
            id: test4,
            fileName: path.resolve('tests/math.spec.ts'),
            name: 'math should be able to add one to a number',
            status: TestStatus.Success,
          },
          {
            id: test5,
            fileName: path.resolve('tests/math.spec.ts'),
            name: 'math should be able to recognize a negative number',
            status: TestStatus.Success,
          },
          {
            id: test6,
            fileName: path.resolve('tests/pi.spec.ts'),
            name: 'pi should be 3.14',
            status: TestStatus.Success,
          },
        ])
      })

      it('should report mutant coverage', async () => {
        const runResult = await sut.dryRun(createDryRunOptions())
        expectCompleted(runResult)
        expect(runResult.mutantCoverage).toEqual({
          static: {
            '0': 3,
          },
          perTest: {
            [test1]: {
              '1': 1,
              '2': 1,
            },
            [test2]: {
              '1': 1,
              '2': 1,
            },
            [test3]: {
              '5': 1,
              '6': 1,
            },
            [test4]: {
              '3': 1,
              '4': 1,
            },
            [test5]: {
              '7': 1,
              '8': 1,
              '9': 1,
              '10': 1,
              '11': 1,
              '12': 1,
              '13': 1,
              '14': 1,
            },
          },
        })
      })
    })

    describe(VitestTestRunner.prototype.mutantRun.name, () => {
      it('should be able to kill a mutant', async () => {
        await sut.init()
        const runResult = await sut.mutantRun(
          createMutantRunOptions({
            activeMutant: createMutant({ id: '2' }),
            sandboxFileName,
            mutantActivation: 'runtime',
            testFilter: [test1],
          }),
        )
        expectKilled(runResult)
        expect(runResult.killedBy).toEqual([test1])
      })

      it('should bail after the first failing test', async () => {
        await sut.init()
        const runResult = await sut.mutantRun(
          createMutantRunOptions({
            activeMutant: createMutant({ id: '2' }),
            sandboxFileName,
            mutantActivation: 'runtime',
            testFilter: [test1, test2], // tests both kill the mutant
          }),
        )
        expectKilled(runResult)
        expect(runResult.nrOfTests).toEqual(1)
        expect(runResult.killedBy).toEqual([test1])
      })

      it('should report all killing tests if disableBail is enabled', async () => {
        options.disableBail = true
        await sut.init()
        const runResult = await sut.mutantRun(
          createMutantRunOptions({
            activeMutant: createMutant({ id: '2' }),
            sandboxFileName,
            mutantActivation: 'runtime',
            testFilter: [test1, test2], // tests both kill the mutant
          }),
        )
        expectKilled(runResult)
        expect(runResult.nrOfTests).toEqual(2)
        expect(runResult.killedBy).toEqual([test1, test2])
      })

      it('should be able to survive after killing mutant', async () => {
        // Arrange
        await sut.init()
        await sut.mutantRun(
          createMutantRunOptions({
            activeMutant: createMutant({ id: '2' }),
            sandboxFileName,
            mutantActivation: 'runtime',
            testFilter: [test1],
          }),
        )

        // Act
        const runResult = await sut.mutantRun(
          createMutantRunOptions({
            activeMutant: createMutant({ id: '11' }), // Should survive
            sandboxFileName,
            mutantActivation: 'runtime',
            testFilter: [test6],
          }),
        )

        // Assert
        expectSurvived(runResult)
        expect(runResult.nrOfTests).toBe(1)
      })

      it('should be able to kill a static mutant', async () => {
        // Act
        await sut.init()
        const runResult = await sut.mutantRun(
          createMutantRunOptions({
            activeMutant: createMutant({ id: '0' }), // Static mutant
            sandboxFileName,
            mutantActivation: 'static',
            testFilter: [test6],
          }),
        )

        // Assert
        expectKilled(runResult)
        expect(runResult.killedBy).toEqual([test6])
        expect(runResult.failureMessage).toContain('expected 2.86 to be 3.14')
      })

      it('should be able to reload the environment after a static mutant is tested', async () => {
        // Arrange
        await sut.init()
        await sut.mutantRun(
          createMutantRunOptions({
            activeMutant: createMutant({ id: '0' }), // Pollute the environment with a static mutant
            sandboxFileName,
            mutantActivation: 'static',
          }),
        )

        // Act
        const runResult = await sut.mutantRun(
          createMutantRunOptions({
            activeMutant: createMutant({ id: '11' }), // Should survive
            sandboxFileName,
            mutantActivation: 'runtime',
            testFilter: undefined, // no test filter, so test5 is also executed, the one that kills the static mutant
          }),
        )

        // Assert
        expectSurvived(runResult)
      })

      it('should not be able to kill a static mutant when mutantActivation is runTime', async () => {
        // Act
        await sut.init()
        const runResult = await sut.mutantRun(
          createMutantRunOptions({
            activeMutant: createMutant({ id: '0' }), // Static mutant
            sandboxFileName,
            mutantActivation: 'runtime',
            testFilter: [test6],
          }),
        )

        // Assert
        expectSurvived(runResult)
      })

      it('mutant run with single filter should only run 1 test', async () => {
        await sut.init()
        const mutantRunOptions = createMutantRunOptions({
          activeMutant: createMutant({ id: '1' }),
          sandboxFileName,
          testFilter: [test1],
        })
        mutantRunOptions.activeMutant.id = '1'

        const runResult = await sut.mutantRun(mutantRunOptions)

        expectKilled(runResult)
        expect(runResult.nrOfTests).toBe(1)
      })
    })
  })

  describe('using multiple-configs project', () => {
    beforeEach(async () => {
      sandbox = new TempTestDirectorySandbox('multiple-configs')
      await sandbox.init()
    })

    it('should load default vitest config when config file is not set', async () => {
      options.vitest.configFile = undefined

      await sut.init()
      const runResult = await sut.dryRun(createDryRunOptions())

      expectCompleted(runResult)
      expect(runResult.tests).toHaveLength(1)
      expect(runResult.tests[0].name).toBe(
        'math should be able to add two numbers',
      )
    })

    it('should load custom vitest config when config file is set', async () => {
      options.vitest.configFile = 'vitest.only.addOne.config.ts'

      await sut.init()
      const runResult = await sut.dryRun(createDryRunOptions())

      expectCompleted(runResult)
      expect(runResult.tests).toHaveLength(1)
      expect(runResult.tests[0].name).toBe(
        'math should be able to add one to a number',
      )
    })
  })

  describe('using a project using workspaces', () => {
    let fooTestId: string
    let barTestId: string

    beforeEach(async () => {
      sandbox = new TempTestDirectorySandbox('workspaces')
      await sandbox.init()
      fooTestId = 'packages/foo/src/math.spec.js#min should min 44, 2 = 42'
      barTestId = 'packages/bar/src/math.spec.js#add should add 40, 2 = 42'
    })

    it('should report mutant coverage', async () => {
      await sut.init()
      const runResult = await sut.dryRun(createDryRunOptions())
      expectCompleted(runResult)
      expect(runResult.mutantCoverage).toEqual({
        static: {},
        perTest: {
          [barTestId]: {
            '0': 1,
            '1': 1,
          },
          [fooTestId]: {
            '2': 1,
            '3': 1,
          },
        },
      })
    })

    it('should be able to kill a mutant inside one of the projects', async () => {
      await sut.init()
      const runResult = await sut.mutantRun(
        createMutantRunOptions({
          activeMutant: createMutant({ id: '1' }),
          sandboxFileName: path.resolve(
            sandbox.tmpDir,
            'packages',
            'bar',
            'src',
            'math.js',
          ),
        }),
      )
      expectKilled(runResult)
      expect(runResult.killedBy).toEqual([barTestId])
    })
  })

  describe('using a project with tests without properly awaited assertions', () => {
    beforeEach(async () => {
      sandbox = new TempTestDirectorySandbox('async-failure')
      await sandbox.init()
    })

    async function actErroredMutant() {
      await sut.init()
      return sut.mutantRun(
        createMutantRunOptions({ activeMutant: createMutant({ id: '1' }) }),
      )
    }

    // See https://github.com/stryker-mutator/stryker-js/issues/4306
    it('should be able to report an ErrorResult', async () => {
      const runResult = await actErroredMutant()
      expectErrored(runResult)
      expect(runResult.errorMessage).toContain(
        'An error occurred outside of a test run',
      )
    })

    it('should be able recover from an error result', async () => {
      await actErroredMutant()
      const runResult = await sut.mutantRun(
        createMutantRunOptions({ activeMutant: createMutant({ id: '3' }) }),
      )
      expectSurvived(runResult)
    })
  })

  // See https://github.com/stryker-mutator/stryker-js/issues/4257
  describe('using a project using "--dir <path>"', () => {
    beforeEach(async () => {
      sandbox = new TempTestDirectorySandbox('deep-project')
      await sandbox.init()
    })

    it('should be able to report an ErrorResult', async () => {
      options.vitest.dir = 'packages'
      await sut.init()
      const runResult = await sut.dryRun(createDryRunOptions())
      expectCompleted(runResult)
      expect(runResult.tests).toHaveLength(1)
      expectTestResults(runResult, [
        {
          id: 'packages/app/src/math.spec.js#math should be 5 for add(2, 3)',
          status: TestStatus.Success,
        },
      ])
    })
  })

  // Vitest fixtures (test.extend) require hooks like beforeEach to use object destructuring,
  // e.g. ({ task }) => {} instead of (test) => {}, otherwise Vitest throws an error.
  describe('using vitest fixtures', () => {
    const test1 = 'tests/math-with-fixtures.spec.ts#math with fixtures should be able to add two numbers using fixture'
    const test2 =
      'tests/math-with-fixtures.spec.ts#math with fixtures should be able to add negative numbers using fixture'

    beforeEach(async () => {
      sandbox = new TempTestDirectorySandbox('vitest-fixtures')
      await sandbox.init()
    })

    it('should run tests that use vitest fixtures', async () => {
      await sut.init()
      const runResult = await sut.dryRun(createDryRunOptions())
      expectCompleted(runResult)
      expect(runResult.tests).toHaveLength(2)
      expectTestResults(runResult, [
        {
          id: test1,
          status: TestStatus.Success,
        },
        {
          id: test2,
          status: TestStatus.Success,
        },
      ])
    })

    it('should report mutant coverage for tests using fixtures', async () => {
      await sut.init()
      const runResult = await sut.dryRun(createDryRunOptions())
      expectCompleted(runResult)
      expect(runResult.mutantCoverage).toEqual(
        expect.objectContaining({
          perTest: {
            [test1]: {
              '1': 1,
              '2': 1,
            },
            [test2]: {
              '1': 1,
              '2': 1,
            },
          },
        }),
      )
    })

    it('should be able to kill a mutant in fixture-based tests', async () => {
      await sut.init()
      const runResult = await sut.mutantRun(
        createMutantRunOptions({
          activeMutant: createMutant({ id: '2' }),
          sandboxFileName: path.resolve(sandbox.tmpDir, 'math.ts'),
          mutantActivation: 'runtime',
          testFilter: [test1],
        }),
      )
      expectKilled(runResult)
      expect(runResult.killedBy).toEqual([test1])
    })
  })
})
