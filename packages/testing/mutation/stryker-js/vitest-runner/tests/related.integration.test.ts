import path from 'path'

import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import { expect } from 'vitest'

import { expectCompleted, expectKilled, sortTestResults } from './__fixtures__/assertions.js'
import { createDryRunOptions, createMutant, createMutantRunOptions } from './__fixtures__/factories.js'
import { runnerContext } from './__fixtures__/vitest-runner-harness.js'

const Feature = makeFeature({ it, layer })

// Tests for [Vitest's related mode](https://vitest.dev/guide/cli.html#vitest-related)
// @see https://github.com/stryker-mutator/stryker-js/issues/5465
Feature('Selecting tests related to a mutated file')
  .body(({ scenario }) => {
    const mathTest1 = 'src/math.spec.ts#math should support simple addition'
    const mathTest2 = 'src/math.spec.ts#math should support simple subtraction'
    const stringUtilsTest1 = 'src/string-utils.spec.ts#string-utils should capitalize the first letter'

    scenario(
      'only the tests touching a modified file run in related mode',
      Gherkin.Do.pipe(
        Given('a runner on the multiple-files project with related mode enabled')(
          'runner',
          () =>
            runnerContext('multiple-files', (options) => {
              options.vitest.related = true
            }),
        ),
        When('the runner is initialized')('initialized', (s) =>
          Effect.promise(async () => {
            await s.runner.sut.init()
            return s.runner
          })),
        When('a dry run is requested for the math source file')(
          'mathResult',
          (s) =>
            Effect.promise(() =>
              s.runner.sut.dryRun(
                createDryRunOptions({
                  files: [path.resolve(s.runner.sandbox.tmpDir, 'src', 'math.ts')],
                }),
              )
            ),
        ),
        When('a dry run is requested for the string utils source file')(
          'stringUtilsResult',
          (s) =>
            Effect.promise(() =>
              s.runner.sut.dryRun(
                createDryRunOptions({
                  files: [path.resolve(s.runner.sandbox.tmpDir, 'src', 'string-utils.ts')],
                }),
              )
            ),
        ),
        Then('each run reports only the tests covering its file')((s) => {
          expectCompleted(s.mathResult)
          expect(
            sortTestResults(s.mathResult.tests).map(({ id }) => id),
          ).toEqual([
            mathTest1,
            mathTest2,
            // other test shouldn't run
          ])
          expectCompleted(s.stringUtilsResult)
          expect(s.stringUtilsResult.tests.map(({ id }) => id)).toEqual([
            stringUtilsTest1,
          ])
        }),
      ),
    )

    scenario(
      'a mutant run in related mode only runs the tests covering the mutated file',
      Gherkin.Do.pipe(
        Given('a runner on the multiple-files project with related mode enabled')(
          'runner',
          () =>
            runnerContext('multiple-files', (options) => {
              options.vitest.related = true
            }),
        ),
        When('the runner is initialized')('initialized', (s) =>
          Effect.promise(async () => {
            await s.runner.sut.init()
            return s.runner
          })),
        When('a mutant in the math file is run')('result', (s) =>
          Effect.promise(() =>
            s.runner.sut.mutantRun(
              createMutantRunOptions({
                activeMutant: createMutant({ id: '9' }),
                testFilter: [mathTest1],
                sandboxFileName: path.resolve(s.runner.sandbox.tmpDir, 'src', 'math.ts'),
              }),
            )
          )),
        Then('the mutant is killed by its covering test')((s) => {
          expectKilled(s.result)
        }),
      ),
    )

    scenario(
      'every test runs when related mode is disabled',
      Gherkin.Do.pipe(
        Given('a runner on the multiple-files project with related mode disabled')(
          'runner',
          () =>
            runnerContext('multiple-files', (options) => {
              options.vitest.related = false
            }),
        ),
        When('the runner is initialized')('initialized', (s) =>
          Effect.promise(async () => {
            await s.runner.sut.init()
            return s.runner
          })),
        When('a dry run is requested for the math source file')(
          'mathResult',
          (s) =>
            Effect.promise(() =>
              s.runner.sut.dryRun(
                createDryRunOptions({
                  files: [path.resolve(s.runner.sandbox.tmpDir, 'src', 'math.ts')],
                }),
              )
            ),
        ),
        Then('all tests of the project are reported')((s) => {
          expectCompleted(s.mathResult)
          expect(
            sortTestResults(s.mathResult.tests).map(({ id }) => id),
          ).toEqual([mathTest1, mathTest2, stringUtilsTest1])
        }),
      ),
    )

    scenario(
      'related mode follows a published package specifier to the mutated file',
      Gherkin.Do.pipe(
        Given('a runner on the package-name-imports project with related mode enabled')(
          'runner',
          () =>
            runnerContext('package-name-imports', (options) => {
              options.vitest.related = true
            }),
        ),
        When('the runner is initialized')('initialized', (s) =>
          Effect.promise(async () => {
            await s.runner.sut.init()
            return s.runner
          })),
        When('a dry run is requested for the math source file')(
          'mathResult',
          (s) =>
            Effect.promise(() =>
              s.runner.sut.dryRun(
                createDryRunOptions({
                  files: [path.resolve(s.runner.sandbox.tmpDir, 'src', 'math.ts')],
                }),
              )
            ),
        ),
        Then('only the tests that import the package name are reported')((s) => {
          expectCompleted(s.mathResult)
          expect(
            sortTestResults(s.mathResult.tests).map(({ id }) => id),
          ).toEqual([
            'src/math.spec.ts#math should support simple addition',
            'src/math.spec.ts#math should support simple subtraction',
          ])
        }),
      ),
    )
  })
