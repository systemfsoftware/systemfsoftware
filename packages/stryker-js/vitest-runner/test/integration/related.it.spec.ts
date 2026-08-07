import path from 'path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createVitestTestRunnerFactory, VitestTestRunner } from '../../dist/index.mjs'
import type { VitestRunnerOptionsWithStrykerOptions } from '../../src/vitest-runner-options-with-stryker-options.js'
import { expectCompleted, expectKilled, sortTestResults } from '../util/assertions.js'
import {
  createDryRunOptions,
  createMutant,
  createMutantRunOptions,
  createStrykerOptions,
  createTestInjector,
} from '../util/factories.js'
import { TempTestDirectorySandbox } from '../util/temp-test-directory-sandbox.js'

// Tests for [Vitest's related mode](https://vitest.dev/guide/cli.html#vitest-related)
// @see https://github.com/stryker-mutator/stryker-js/issues/5465
describe('Vitest runner related', () => {
  let sut: VitestTestRunner
  let sandbox: TempTestDirectorySandbox
  let options: VitestRunnerOptionsWithStrykerOptions
  let mathFileName: string
  let stringUtilsFileName: string
  const mathTest1 = 'src/math.spec.ts#math should support simple addition'
  const mathTest2 = 'src/math.spec.ts#math should support simple subtraction'
  const stringUtilsTest1 = 'src/string-utils.spec.ts#string-utils should capitalize the first letter'

  beforeEach(async () => {
    options = createStrykerOptions()
    sut = createTestInjector(options).injectFunction(
      createVitestTestRunnerFactory('__stryker2__'),
    )
    sandbox = new TempTestDirectorySandbox('multiple-files')
    await sandbox.init()
    mathFileName = path.resolve(sandbox.tmpDir, 'src', 'math.ts')
    stringUtilsFileName = path.resolve(
      sandbox.tmpDir,
      'src',
      'string-utils.ts',
    )
    await sut.init()
  })

  it('should support related = true', async () => {
    options.vitest.related = true
    const actualResultMath = await sut.dryRun(
      createDryRunOptions({ files: [mathFileName] }),
    )
    const actualResultStringUtils = await sut.dryRun(
      createDryRunOptions({ files: [stringUtilsFileName] }),
    )
    expectCompleted(actualResultMath)
    expect(
      sortTestResults(actualResultMath.tests).map(({ id }) => id),
    ).toEqual([
      mathTest1,
      mathTest2,
      // other test shouldn't run
    ])
    expectCompleted(actualResultStringUtils)
    expect(actualResultStringUtils.tests.map(({ id }) => id)).toEqual([
      stringUtilsTest1,
    ])
  })

  it('should support related = true when mutation testing', async () => {
    options.vitest.related = true
    const actualResultMath = await sut.mutantRun(
      createMutantRunOptions({
        activeMutant: createMutant({ id: '9' }),
        testFilter: [mathTest1],
        sandboxFileName: mathFileName,
      }),
    )
    expectKilled(actualResultMath)
  })

  it('should support related = false', async () => {
    options.vitest.related = false
    const actualResult = await sut.dryRun(
      createDryRunOptions({ files: [mathFileName] }),
    )
    expectCompleted(actualResult)
    expect(
      sortTestResults(actualResult.tests).map(({ id }) => id),
    ).toEqual([mathTest1, mathTest2, stringUtilsTest1])
  })

  afterEach(async () => {
    await sut.dispose()
    await sandbox.dispose()
  })
})
