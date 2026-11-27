import { it } from '@systemfsoftware/vitest'
import { Effect } from 'effect'
import type { RunnerTask } from 'vitest'
import { startVitest } from 'vitest/node'

const url = (path: string): string => decodeURIComponent(new URL(path, import.meta.url).pathname)

const runtimeSource = url('../src/mod.ts')
const forkEntry = url('../../runner/vitest/src/mod.ts')
const forkFailure = url('../../runner/vitest/src/failure.ts')
const forkGuard = url('../../runner/vitest/src/guard.ts')
const forkIntegration = url('../../runner/vitest/src/integration.ts')
const forkTestClock = url('../../runner/vitest/src/TestClock.ts')
const packageRoot = url('../')

const failuresOf = (tasks: ReadonlyArray<RunnerTask>, into: Array<string>): void => {
  for (const task of tasks) {
    if (task.result?.state === 'fail') {
      for (const error of task.result.errors ?? []) into.push(`${task.name}: ${error.message}`)
    }
    if ('tasks' in task) failuresOf(task.tasks, into)
  }
}

const runFailingFixture = (): Effect.Effect<string> =>
  Effect.promise(async () => {
    const errors: Array<string> = []
    const vitest = await startVitest('test', [], {
      root: packageRoot,
      config: false,
      include: ['tests/__fixtures__/shared-build-fails.fixture.ts'],
      run: true,
      watch: false,
      pool: 'threads',
      passWithNoTests: false,
      silent: true,
      setupFiles: ['@systemfsoftware/vitest/guard'],
      testTimeout: 30_000,
      hookTimeout: 30_000,
    }, {
      resolve: {
        alias: {
          '@systemfsoftware/vitest/failure': forkFailure,
          '@systemfsoftware/vitest/TestClock': forkTestClock,
          '@systemfsoftware/vitest/integration': forkIntegration,
          '@systemfsoftware/vitest/guard': forkGuard,
          '@systemfsoftware/vitest': forkEntry,
          '@systemfsoftware/effect-spec-runtime': runtimeSource,
        },
      },
    })
    for (const file of vitest.state.getFiles()) {
      failuresOf([file], errors)
    }
    const failedTests = vitest.state.getCountOfFailedTests()
    await vitest.close()
    return `failedTests=${failedTests}\n${errors.join('\n')}`
  })

it('Should_FailTheSuiteWithTheBuildCauseAndRunNoScenario_When_SharedLayerBuildFails', function*({ expect }) {
  const report = yield* runFailingFixture()
  yield* expect({
    cause: report.includes('shared build exploded'),
    scenarioRan: report.includes('SCENARIO-RAN'),
  }).toEqual({ cause: true, scenarioRan: false })
})
