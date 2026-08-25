import fs from 'fs'
import path from 'path'

import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { TestStatus } from '@systemfsoftware/stryker-js-plugin-api/test-runner'
import { Effect } from 'effect'
import { expect } from 'vitest'

import {
  expectCompleted,
  expectErrored,
  expectKilled,
  expectSurvived,
  expectTestResults,
} from './__fixtures__/assertions.js'
import { createDryRunOptions, createMutant, createMutantRunOptions } from './__fixtures__/factories.js'
import { TempTestDirectorySandbox } from './__fixtures__/temp-test-directory-sandbox.js'
import { runnerContext, twoRunnersContext } from './__fixtures__/vitest-runner-harness.js'
const Feature = makeFeature({ it, layer })

const test1 = 'tests/add.spec.ts#add should be able to add two numbers'
const test2 = 'tests/add.spec.ts#add should be able to add a negative number'
const test3 = 'tests/math.spec.ts#math should be able negate a number'
const test4 = 'tests/math.spec.ts#math should be able to add one to a number'
const test5 = 'tests/math.spec.ts#math should be able to recognize a negative number'
const test6 = 'tests/pi.spec.ts#pi should be 3.14'

const mathFile = (s: { runner: { sandbox: TempTestDirectorySandbox } }): string =>
  path.resolve(s.runner.sandbox.tmpDir, 'math.ts')
const specFile = (s: { runner: { sandbox: TempTestDirectorySandbox } }, file: string): string =>
  path.resolve(s.runner.sandbox.tmpDir, file)

Feature('Driving the Vitest runner through the Stryker interface')
  .body(({ scenario }) => {
    scenario(
      'a dry run reports every test of a simple project',
      Gherkin.Do.pipe(
        Given('a runner on the simple-project sandbox')('runner', () => runnerContext('simple-project')),
        When('the runner is initialized and a dry run is requested')('result', (s) =>
          Effect.promise(async () => {
            await s.runner.sut.init()
            return s.runner.sut.dryRun(createDryRunOptions())
          })),
        Then('every spec is reported with its file and status')((s) => {
          expectCompleted(s.result)
          expectTestResults(s.result, [
            {
              id: test1,
              fileName: specFile(s, 'tests/add.spec.ts'),
              name: 'add should be able to add two numbers',
              status: TestStatus.Success,
            },
            {
              id: test2,
              fileName: specFile(s, 'tests/add.spec.ts'),
              name: 'add should be able to add a negative number',
              status: TestStatus.Success,
            },
            {
              id: test3,
              fileName: specFile(s, 'tests/math.spec.ts'),
              name: 'math should be able negate a number',
              status: TestStatus.Success,
            },
            {
              id: test4,
              fileName: specFile(s, 'tests/math.spec.ts'),
              name: 'math should be able to add one to a number',
              status: TestStatus.Success,
            },
            {
              id: test5,
              fileName: specFile(s, 'tests/math.spec.ts'),
              name: 'math should be able to recognize a negative number',
              status: TestStatus.Success,
            },
            {
              id: test6,
              fileName: specFile(s, 'tests/pi.spec.ts'),
              name: 'pi should be 3.14',
              status: TestStatus.Success,
            },
          ])
        }),
      ),
    )

    scenario(
      'a dry run reports per-test mutant coverage',
      Gherkin.Do.pipe(
        Given('a runner on the simple-project sandbox')('runner', () => runnerContext('simple-project')),
        When('the runner is initialized and a dry run is requested')('result', (s) =>
          Effect.promise(async () => {
            await s.runner.sut.init()
            return s.runner.sut.dryRun(createDryRunOptions())
          })),
        Then('the coverage is grouped per test id')((s) => {
          expectCompleted(s.result)
          expect(s.result.mutantCoverage).toEqual({
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
        }),
      ),
    )

    scenario(
      'a runtime mutant is killed by its covering test',
      Gherkin.Do.pipe(
        Given('a runner on the simple-project sandbox')('runner', () => runnerContext('simple-project')),
        When('the runner is initialized and the mutant is run')('result', (s) =>
          Effect.promise(async () => {
            await s.runner.sut.init()
            return s.runner.sut.mutantRun(
              createMutantRunOptions({
                activeMutant: createMutant({ id: '2' }),
                sandboxFileName: mathFile(s),
                mutantActivation: 'runtime',
                testFilter: [test1],
              }),
            )
          })),
        Then('the mutant is killed by the first test')((s) => {
          expectKilled(s.result)
          expect(s.result.killedBy).toEqual([test1])
        }),
      ),
    )

    scenario(
      'the run bails after the first failing test',
      Gherkin.Do.pipe(
        Given('a runner on the simple-project sandbox')('runner', () => runnerContext('simple-project')),
        When('the runner is initialized and both killing tests are run')('result', (s) =>
          Effect.promise(async () => {
            await s.runner.sut.init()
            return s.runner.sut.mutantRun(
              createMutantRunOptions({
                activeMutant: createMutant({ id: '2' }),
                sandboxFileName: mathFile(s),
                mutantActivation: 'runtime',
                testFilter: [test1, test2], // tests both kill the mutant
              }),
            )
          })),
        Then('only the first test ran')((s) => {
          expectKilled(s.result)
          expect(s.result.nrOfTests).toEqual(1)
          expect(s.result.killedBy).toEqual([test1])
        }),
      ),
    )

    scenario(
      'all killing tests are reported when bailing is disabled',
      Gherkin.Do.pipe(
        Given('a runner on the simple-project sandbox with bail disabled')(
          'runner',
          () =>
            runnerContext('simple-project', (options) => {
              options.disableBail = true
            }),
        ),
        When('the runner is initialized and both killing tests are run')('result', (s) =>
          Effect.promise(async () => {
            await s.runner.sut.init()
            return s.runner.sut.mutantRun(
              createMutantRunOptions({
                activeMutant: createMutant({ id: '2' }),
                sandboxFileName: mathFile(s),
                mutantActivation: 'runtime',
                testFilter: [test1, test2], // tests both kill the mutant
              }),
            )
          })),
        Then('both killing tests are reported')((s) => {
          expectKilled(s.result)
          expect(s.result.nrOfTests).toEqual(2)
          expect(s.result.killedBy).toEqual([test1, test2])
        }),
      ),
    )

    scenario(
      'a surviving mutant run after a killed one reports a survivor',
      Gherkin.Do.pipe(
        Given('a runner on the simple-project sandbox')('runner', () => runnerContext('simple-project')),
        When('the runner is initialized and a killed mutant is run first')('killed', (s) =>
          Effect.promise(async () => {
            await s.runner.sut.init()
            return s.runner.sut.mutantRun(
              createMutantRunOptions({
                activeMutant: createMutant({ id: '2' }),
                sandboxFileName: mathFile(s),
                mutantActivation: 'runtime',
                testFilter: [test1],
              }),
            )
          })),
        When('a surviving mutant is run next')('survivor', (s) =>
          Effect.promise(() =>
            s.runner.sut.mutantRun(
              createMutantRunOptions({
                activeMutant: createMutant({ id: '11' }), // Should survive
                sandboxFileName: mathFile(s),
                mutantActivation: 'runtime',
                testFilter: [test6],
              }),
            )
          )),
        Then('the second run reports a survivor with a single test')((s) => {
          expectKilled(s.killed)
          expectSurvived(s.survivor)
          expect(s.survivor.nrOfTests).toBe(1)
        }),
      ),
    )

    scenario(
      'a static mutant is killed when static activation is enabled',
      Gherkin.Do.pipe(
        Given('a runner on the simple-project sandbox')('runner', () => runnerContext('simple-project')),
        When('the runner is initialized and the static mutant is run')('result', (s) =>
          Effect.promise(async () => {
            await s.runner.sut.init()
            return s.runner.sut.mutantRun(
              createMutantRunOptions({
                activeMutant: createMutant({ id: '0' }), // Static mutant
                sandboxFileName: mathFile(s),
                mutantActivation: 'static',
                testFilter: [test6],
              }),
            )
          })),
        Then('the mutant is killed by its covering test')((s) => {
          expectKilled(s.result)
          expect(s.result.killedBy).toEqual([test6])
          expect(s.result.failureMessage).toContain('expected 2.86 to be 3.14')
        }),
      ),
    )

    scenario(
      'the environment is reloaded after a static mutant is tested',
      Gherkin.Do.pipe(
        Given('a runner on the simple-project sandbox')('runner', () => runnerContext('simple-project')),
        When('the environment is polluted with a static mutant')('polluted', (s) =>
          Effect.promise(async () => {
            await s.runner.sut.init()
            return s.runner.sut.mutantRun(
              createMutantRunOptions({
                activeMutant: createMutant({ id: '0' }), // Pollute the environment with a static mutant
                sandboxFileName: mathFile(s),
                mutantActivation: 'static',
              }),
            )
          })),
        When('a surviving runtime mutant is run with no filter')(
          'survivor',
          (s) =>
            Effect.promise(() =>
              s.runner.sut.mutantRun(
                createMutantRunOptions({
                  activeMutant: createMutant({ id: '11' }), // Should survive
                  sandboxFileName: mathFile(s),
                  mutantActivation: 'runtime',
                  testFilter: undefined, // no test filter, so test5 is also executed, the one that kills the static mutant
                }),
              )
            ),
        ),
        Then('the polluted environment no longer affects the run')((s) => {
          expectSurvived(s.survivor)
        }),
      ),
    )

    scenario(
      'a static mutant survives when activation is runtime only',
      Gherkin.Do.pipe(
        Given('a runner on the simple-project sandbox')('runner', () => runnerContext('simple-project')),
        When('the runner is initialized and the static mutant is run with runtime activation')(
          'result',
          (s) =>
            Effect.promise(async () => {
              await s.runner.sut.init()
              return s.runner.sut.mutantRun(
                createMutantRunOptions({
                  activeMutant: createMutant({ id: '0' }), // Static mutant
                  sandboxFileName: mathFile(s),
                  mutantActivation: 'runtime',
                  testFilter: [test6],
                }),
              )
            }),
        ),
        Then('the mutant survives')((s) => {
          expectSurvived(s.result)
        }),
      ),
    )

    scenario(
      'a test filter narrows a run down to a single test',
      Gherkin.Do.pipe(
        Given('a runner on the simple-project sandbox')('runner', () => runnerContext('simple-project')),
        When('the runner is initialized and a single filtered mutant is run')(
          'result',
          (s) =>
            Effect.promise(async () => {
              await s.runner.sut.init()
              return s.runner.sut.mutantRun(
                createMutantRunOptions({
                  activeMutant: createMutant({ id: '1' }),
                  sandboxFileName: mathFile(s),
                  testFilter: [test1],
                }),
              )
            }),
        ),
        Then('exactly one test ran')((s) => {
          expectKilled(s.result)
          expect(s.result.nrOfTests).toBe(1)
        }),
      ),
    )

    scenario(
      'the default vitest config is used when no config file is configured',
      Gherkin.Do.pipe(
        Given('a runner on the multiple-configs project')('runner', () => runnerContext('multiple-configs')),
        When('the runner is initialized and a dry run is requested')('result', (s) =>
          Effect.promise(async () => {
            await s.runner.sut.init()
            return s.runner.sut.dryRun(createDryRunOptions())
          })),
        Then('the default config is loaded')((s) => {
          expectCompleted(s.result)
          expect(s.result.tests).toHaveLength(1)
          expect(s.result.tests[0].name).toBe(
            'math should be able to add two numbers',
          )
        }),
      ),
    )

    scenario(
      'the configured vitest config file is used',
      Gherkin.Do.pipe(
        Given('a runner on the multiple-configs project with the add-one config')(
          'runner',
          () =>
            runnerContext('multiple-configs', (options) => {
              options.vitest.configFile = 'vitest.only.addOne.config.ts'
            }),
        ),
        When('the runner is initialized and a dry run is requested')('result', (s) =>
          Effect.promise(async () => {
            await s.runner.sut.init()
            return s.runner.sut.dryRun(createDryRunOptions())
          })),
        Then('the custom config is loaded')((s) => {
          expectCompleted(s.result)
          expect(s.result.tests).toHaveLength(1)
          expect(s.result.tests[0].name).toBe(
            'math should be able to add one to a number',
          )
        }),
      ),
    )

    scenario(
      'a dry run over a workspace project reports coverage per project',
      Gherkin.Do.pipe(
        Given('a runner on the workspaces project')('runner', () => runnerContext('workspaces')),
        When('the runner is initialized and a dry run is requested')('result', (s) =>
          Effect.promise(async () => {
            await s.runner.sut.init()
            return s.runner.sut.dryRun(createDryRunOptions())
          })),
        Then('the coverage is reported for both workspace packages')((s) => {
          expectCompleted(s.result)
          expect(s.result.mutantCoverage).toEqual({
            static: {},
            perTest: {
              ['packages/bar/src/math.spec.js#add should add 40, 2 = 42']: {
                '0': 1,
                '1': 1,
              },
              ['packages/foo/src/math.spec.js#min should min 44, 2 = 42']: {
                '2': 1,
                '3': 1,
              },
            },
          })
        }),
      ),
    )

    scenario(
      'a mutant inside one workspace package is killed',
      Gherkin.Do.pipe(
        Given('a runner on the workspaces project')('runner', () => runnerContext('workspaces')),
        When('the runner is initialized and the bar mutant is run')('result', (s) =>
          Effect.promise(async () => {
            await s.runner.sut.init()
            return s.runner.sut.mutantRun(
              createMutantRunOptions({
                activeMutant: createMutant({ id: '1' }),
                sandboxFileName: path.resolve(
                  s.runner.sandbox.tmpDir,
                  'packages',
                  'bar',
                  'src',
                  'math.js',
                ),
              }),
            )
          })),
        Then('the mutant is killed by the bar test')((s) => {
          expectKilled(s.result)
          expect(s.result.killedBy).toEqual([
            'packages/bar/src/math.spec.js#add should add 40, 2 = 42',
          ])
        }),
      ),
    )

    scenario(
      'a run with unawaited assertions reports an error result',
      Gherkin.Do.pipe(
        Given('a runner on the async-failure project')('runner', () => runnerContext('async-failure')),
        // See https://github.com/stryker-mutator/stryker-js/issues/4306
        When('the runner is initialized and the failing mutant is run')('result', (s) =>
          Effect.promise(async () => {
            await s.runner.sut.init()
            return s.runner.sut.mutantRun(
              createMutantRunOptions({ activeMutant: createMutant({ id: '1' }) }),
            )
          })),
        Then('an error result is reported')((s) => {
          expectErrored(s.result)
          expect(s.result.errorMessage).toContain(
            'An error occurred outside of a test run',
          )
        }),
      ),
    )

    scenario(
      'the runner recovers after an error result',
      Gherkin.Do.pipe(
        Given('a runner on the async-failure project')('runner', () => runnerContext('async-failure')),
        When('an erroring mutant is run first')('errored', (s) =>
          Effect.promise(async () => {
            await s.runner.sut.init()
            return s.runner.sut.mutantRun(
              createMutantRunOptions({ activeMutant: createMutant({ id: '1' }) }),
            )
          })),
        When('a normal mutant is run next')('survivor', (s) =>
          Effect.promise(() =>
            s.runner.sut.mutantRun(
              createMutantRunOptions({ activeMutant: createMutant({ id: '3' }) }),
            )
          )),
        Then('the second run completes')((s) => {
          expectErrored(s.errored)
          expectSurvived(s.survivor)
        }),
      ),
    )

    scenario(
      'a scan dir subdirectory still finds the covering tests',
      Gherkin.Do.pipe(
        Given('a runner on the deep-project sandbox scanning the packages dir')(
          'runner',
          () =>
            runnerContext('deep-project', (options) => {
              options.vitest.dir = 'packages'
            }),
        ),
        When('the runner is initialized and a dry run is requested')('result', (s) =>
          Effect.promise(async () => {
            await s.runner.sut.init()
            return s.runner.sut.dryRun(createDryRunOptions())
          })),
        Then('the tests inside the scan dir are reported')((s) => {
          expectCompleted(s.result)
          expect(s.result.tests).toHaveLength(1)
          expectTestResults(s.result, [
            {
              id: 'packages/app/src/math.spec.js#math should be 5 for add(2, 3)',
              status: TestStatus.Success,
            },
          ])
        }),
      ),
    )

    scenario(
      'a mutant is killed when the scan dir is a subdirectory',
      Gherkin.Do.pipe(
        Given('a runner on the deep-project sandbox scanning the packages dir')(
          'runner',
          () =>
            runnerContext('deep-project', (options) => {
              options.vitest.dir = 'packages'
            }),
        ),
        // F1: with a root-anchored test id and a subdirectory scan dir, the
        // selection must still reach the covering test file.
        When('the runner is initialized and the app mutant is run')('result', (s) =>
          Effect.promise(async () => {
            await s.runner.sut.init()
            return s.runner.sut.mutantRun(
              createMutantRunOptions({
                activeMutant: createMutant({ id: '1' }),
                sandboxFileName: path.resolve(
                  s.runner.sandbox.tmpDir,
                  'packages',
                  'app',
                  'src',
                  'math.js',
                ),
                mutantActivation: 'runtime',
                testFilter: [
                  'packages/app/src/math.spec.js#math should be 5 for add(2, 3)',
                ],
              }),
            )
          })),
        Then('the mutant is killed by the app test')((s) => {
          expectKilled(s.result)
          expect(s.result.killedBy).toEqual([
            'packages/app/src/math.spec.js#math should be 5 for add(2, 3)',
          ])
        }),
      ),
    )

    scenario(
      'tests that use vitest fixtures run and report coverage',
      Gherkin.Do.pipe(
        Given('a runner on the vitest-fixtures project')('runner', () => runnerContext('vitest-fixtures')),
        When('the runner is initialized and a dry run is requested')('result', (s) =>
          Effect.promise(async () => {
            await s.runner.sut.init()
            return s.runner.sut.dryRun(createDryRunOptions())
          })),
        Then('both fixture tests are reported')((s) => {
          expectCompleted(s.result)
          expect(s.result.tests).toHaveLength(2)
          expectTestResults(s.result, [
            {
              id: 'tests/math-with-fixtures.spec.ts#math with fixtures should be able to add two numbers using fixture',
              status: TestStatus.Success,
            },
            {
              id:
                'tests/math-with-fixtures.spec.ts#math with fixtures should be able to add negative numbers using fixture',
              status: TestStatus.Success,
            },
          ])
        }),
      ),
    )

    scenario(
      'fixture-based tests report per-test mutant coverage',
      Gherkin.Do.pipe(
        Given('a runner on the vitest-fixtures project')('runner', () => runnerContext('vitest-fixtures')),
        When('the runner is initialized and a dry run is requested')('result', (s) =>
          Effect.promise(async () => {
            await s.runner.sut.init()
            return s.runner.sut.dryRun(createDryRunOptions())
          })),
        Then('the fixture coverage is reported per test')((s) => {
          expectCompleted(s.result)
          expect(s.result.mutantCoverage).toEqual(
            expect.objectContaining({
              perTest: {
                ['tests/math-with-fixtures.spec.ts#math with fixtures should be able to add two numbers using fixture']:
                  {
                    '1': 1,
                    '2': 1,
                  },
                ['tests/math-with-fixtures.spec.ts#math with fixtures should be able to add negative numbers using fixture']:
                  {
                    '1': 1,
                    '2': 1,
                  },
              },
            }),
          )
        }),
      ),
    )

    scenario(
      'a mutant in fixture-based tests is killed',
      Gherkin.Do.pipe(
        Given('a runner on the vitest-fixtures project')('runner', () => runnerContext('vitest-fixtures')),
        When('the runner is initialized and the fixture mutant is run')('result', (s) =>
          Effect.promise(async () => {
            await s.runner.sut.init()
            return s.runner.sut.mutantRun(
              createMutantRunOptions({
                activeMutant: createMutant({ id: '2' }),
                sandboxFileName: path.resolve(s.runner.sandbox.tmpDir, 'math.ts'),
                mutantActivation: 'runtime',
                testFilter: [
                  'tests/math-with-fixtures.spec.ts#math with fixtures should be able to add two numbers using fixture',
                ],
              }),
            )
          })),
        Then('the mutant is killed by its fixture test')((s) => {
          expectKilled(s.result)
          expect(s.result.killedBy).toEqual([
            'tests/math-with-fixtures.spec.ts#math with fixtures should be able to add two numbers using fixture',
          ])
        }),
      ),
    )

    scenario(
      'two runners in one process write distinct setup files and dispose only their own',
      Gherkin.Do.pipe(
        Given('two runners on separate simple-project sandboxes')('runners', () => twoRunnersContext('simple-project')),
        When('the second runner is disposed')('disposed', (s) => Effect.promise(() => s.runners.runner2.sut.dispose())),
        Then('the first setup file still exists and the second is gone')((s) =>
          Effect.gen(function*() {
            yield* Effect.promise(() => fs.promises.access(s.runners.setupFile1))
            yield* Effect.promise(() => expect(fs.promises.access(s.runners.setupFile2)).rejects.toThrow('ENOENT'))
          })
        ),
      ),
    )
  })
