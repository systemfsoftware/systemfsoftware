import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { expectKilled, expectTimeout } from '../util/assertions.js'
import {
  createMutant,
  createMutantRunOptions,
  createStrykerOptions,
  createTestInjector,
  createVitestRunnerOptions,
} from '../util/factories.js'
import { TempTestDirectorySandbox } from '../util/temp-test-directory-sandbox.js'

import { createVitestTestRunnerFactory, VitestTestRunner } from '../../dist/index.mjs'
import type { VitestRunnerOptionsWithStrykerOptions } from '../../src/vitest-runner-options-with-stryker-options.js'

describe('Infinite loop', () => {
  let sut: VitestTestRunner
  let sandbox: TempTestDirectorySandbox
  let options: VitestRunnerOptionsWithStrykerOptions

  beforeEach(async () => {
    sandbox = new TempTestDirectorySandbox('infinite-loop')
    await sandbox.init()
    options = createStrykerOptions()
    options.vitest = createVitestRunnerOptions({ related: false })
    sut = createTestInjector(options).injectFunction(
      createVitestTestRunnerFactory('__stryker2__'),
    )
  })
  afterEach(async () => {
    await sut.dispose()
    await sandbox.dispose()
  })

  it('should be able to recover using a hit counter', async () => {
    // Arrange
    await sut.init()
    const mutantRunOptions = createMutantRunOptions({
      activeMutant: createMutant({ id: '4' }),
      testFilter: ['infinite-loop.spec.js'],
      hitLimit: 10,
    })

    // Act
    const result = await sut.mutantRun(mutantRunOptions)

    // Assert
    expectTimeout(result)
    expect(result.reason).toContain('Hit limit reached')
  })

  it('should reset hit counter state correctly between runs', async () => {
    await sut.init()
    const firstResult = await sut.mutantRun(
      createMutantRunOptions({
        activeMutant: createMutant({ id: '4' }),
        testFilter: ['infinite-loop.spec.js'],
        hitLimit: 10,
        mutantActivation: 'static',
      }),
    )
    const secondResult = await sut.mutantRun(
      createMutantRunOptions({
        // 7 is a 'normal' mutant that should be killed
        activeMutant: createMutant({ id: '7' }),
        testFilter: ['infinite-loop.spec.js'],
        hitLimit: 10,
        mutantActivation: 'static',
      }),
    )

    // Assert
    expectTimeout(firstResult)
    expectKilled(secondResult)
  })
})
