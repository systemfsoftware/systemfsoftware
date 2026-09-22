import { NodeFileSystem } from '@effect/platform-node'
import { And, Gherkin, Given, it, layer, makeFeature, Then } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, FileSystem, Layer } from 'effect'
import { expect } from 'vitest'
import { startVitest } from 'vitest/node'
import type { Reporter, RunnerTestFile } from 'vitest/node'

const Feature = makeFeature({ it, layer })

const DUMP_DIRECTORY = 'artifacts/traces'

interface TaskView {
  readonly tasks?: ReadonlyArray<TaskView>
  readonly type?: string
  readonly result?: { readonly state?: string; readonly errors?: ReadonlyArray<{ readonly name?: string }> }
}

interface Observed {
  readonly annotations: ReadonlyArray<string>
  readonly errorNames: ReadonlyArray<string>
  readonly failedTests: number
  readonly dumps: number
}

const failureList = (task: TaskView): ReadonlyArray<string> =>
  (task.result?.errors ?? []).map((error) => error.name ?? '')

const failuresOf = (
  task: TaskView,
): ReadonlyArray<string> => [...failureList(task), ...(task.tasks ?? []).flatMap(failuresOf)]

const isFailedTest = (task: TaskView): boolean => task.type === 'test' && task.result?.state === 'fail'

const failedCount = (task: TaskView): number =>
  (isFailedTest(task) ? 1 : 0) + (task.tasks ?? []).reduce((sum, child) => sum + failedCount(child), 0)

const observed = (files: ReadonlyArray<RunnerTestFile>): Omit<Observed, 'annotations' | 'dumps'> => ({
  errorNames: files.flatMap(failuresOf),
  failedTests: files.reduce((sum, file) => sum + failedCount(file), 0),
})

const annotationCollector = (): { readonly reporter: Reporter; readonly messages: ReadonlyArray<string> } => {
  const messages: Array<string> = []
  const reporter: Reporter = {
    onTestCaseAnnotate: (testCase, annotation) => {
      messages.push(annotation.message)
      return Promise.resolve()
    },
  }
  return { reporter, messages }
}

const runVitestOn = (fixture: string): Effect.Effect<Omit<Observed, 'dumps'>> =>
  Effect.gen(function*() {
    const collector = annotationCollector()
    const running = yield* Effect.promise(() =>
      startVitest('test', [], {
        include: [`tests/__fixtures__/${fixture}`],
        watch: false,
        coverage: { enabled: false },
        reporters: [collector.reporter],
      })
    )
    const outcome = observed(running.state.getFiles())
    yield* Effect.promise(() => running.close())
    return { ...outcome, annotations: collector.messages }
  })

const clearDumpDirectory = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  return yield* fs.remove(DUMP_DIRECTORY, { recursive: true }).pipe(Effect.ignore)
})

const dumpCount = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  return yield* Effect.match(Effect.map(fs.readDirectory(DUMP_DIRECTORY), (entries) => entries.length), {
    onFailure: () => 0,
    onSuccess: (count) => count,
  })
})

const runFixtureCountingDumps = (fixture: string): Effect.Effect<Observed> =>
  Effect.gen(function*() {
    yield* clearDumpDirectory
    const outcome = yield* runVitestOn(fixture)
    return { ...outcome, dumps: yield* dumpCount }
  }).pipe(Effect.provide(NodeFileSystem.layer))

Feature('Reporting where a broken trace spec leaves its evidence')
  .withScenarioLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'A settlement missing its charge names where its graph was written',
      Gherkin.Do.pipe(
        Given('the deliberately broken parent-child spec was run through the real runner')(
          'outcome',
          () => runVitestOn('annotation-failure.fixture.ts'),
        ),
        Then('the failing case carries an annotation naming the written trace')((s) => {
          expect(s.outcome.annotations.some((message) => message.includes('artifacts/traces/'))).toBe(true)
        }),
        And('the failing case failed on the disparity itself')((s) => {
          expect(s.outcome.failedTests).toBe(1)
          expect(s.outcome.errorNames.filter((name) => name.includes('TraceDisparityError'))).toHaveLength(1)
        }),
      ),
    )

    scenario(
      'A generated input that breaks its spec shrinks to the smallest failing value',
      Gherkin.Do.pipe(
        Given('the deliberately duplicated-span spec was run through the real runner')(
          'outcome',
          () => runFixtureCountingDumps('prop-shrink-failure.fixture.ts'),
        ),
        Then('the failing case names its smallest failing input')((s) => {
          expect(s.outcome.annotations.some((message) => message.includes('shrunk counterexample input: 10'))).toBe(
            true,
          )
        }),
        And('the failing run wrote its evidence exactly once')((s) => {
          expect(s.outcome.dumps).toBe(1)
        }),
        And('the failing case failed on the disparity itself')((s) => {
          expect(s.outcome.failedTests).toBe(1)
          expect(s.outcome.errorNames.filter((name) => name.includes('TraceDisparityError'))).toHaveLength(1)
        }),
      ),
    )
  })
