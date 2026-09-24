import { NodeFileSystem } from '@effect/platform-node'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, FileSystem, Layer } from 'effect'
import { startVitest } from 'vitest/node'
import type { Reporter, RunnerTestFile } from 'vitest/node'

const Feature = makeFeature({ it })

const DUMP_DIRECTORY = 'artifacts/traces'

interface ErrorView {
  readonly name?: string
  readonly message?: string
  readonly source?: string
}

interface TaskView {
  readonly tasks?: ReadonlyArray<TaskView>
  readonly type?: string
  readonly result?: {
    readonly state?: string
    readonly errors?: ReadonlyArray<ErrorView>
  }
}

interface Observed {
  readonly annotations: ReadonlyArray<string>
  readonly errorNames: ReadonlyArray<string>
  readonly errorMessages: ReadonlyArray<string>
  readonly errorSources: ReadonlyArray<string>
  readonly failedTests: number
  readonly dumps: number
}

const errorsOf = (task: TaskView): ReadonlyArray<ErrorView> => [
  ...(task.result?.errors ?? []),
  ...(task.tasks ?? []).flatMap(errorsOf),
]

const isFailedTest = (task: TaskView): boolean => task.type === 'test' && task.result?.state === 'fail'

const failedCount = (task: TaskView): number =>
  (isFailedTest(task) ? 1 : 0) + (task.tasks ?? []).reduce((sum, child) => sum + failedCount(child), 0)

const observed = (files: ReadonlyArray<RunnerTestFile>): Omit<Observed, 'annotations' | 'dumps'> => {
  const errors = files.flatMap(errorsOf)
  return {
    errorNames: errors.map((error) => error.name ?? ''),
    errorMessages: errors.map((error) => error.message ?? ''),
    errorSources: errors.map((error) => error.source ?? ''),
    failedTests: files.reduce((sum, file) => sum + failedCount(file), 0),
  }
}

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

const fixtureRuns = 100

const runVitestOn = (fixture: string): Effect.Effect<Omit<Observed, 'dumps'>> =>
  Effect.gen(function*() {
    const collector = annotationCollector()
    const running = yield* Effect.promise(() =>
      startVitest('test', [], {
        include: [`tests/__fixtures__/${fixture}`],
        watch: false,
        bail: 0,
        coverage: { enabled: false },
        provide: { '@systemfsoftware/vitest:property-check': { runs: fixtureRuns } },
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
  .live('the scenarios drive the real vitest runner, which completes outside the kernel')
  .withScenarioLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'A settlement missing its charge names where its graph was written',
      Gherkin.Do.pipe(
        Given('the deliberately broken parent-child spec')(
          'fixture',
          () => Effect.succeed('annotation-failure.fixture.ts'),
        ),
        When('the spec is run through the real runner')('outcome', (s) => runVitestOn(s.fixture)),
        Then('the failing case carries an annotation naming the written trace, and fails on the disparity itself')((
          s,
          expect,
        ) =>
          expect({
            annotations: s.outcome.annotations,
            failed: s.outcome.failedTests,
            failure: s.outcome.errorMessages.join('\n'),
          }).toSatisfy(
            (report) =>
              report.annotations.some((message) => message.includes('artifacts/traces/')) &&
              report.failed === 1 &&
              report.failure.includes('credit.charge') &&
              report.failure.includes('artifacts/traces/'),
            'the failing case carries an annotation naming its dump and fails on the disparity report',
          )
        ),
      ),
    )

    scenario(
      'A generated input that breaks its spec shrinks to the smallest failing value',
      Gherkin.Do.pipe(
        Given('the spec whose generated draws duplicate a span')(
          'fixture',
          () => Effect.succeed('prop-shrink-failure.fixture.ts'),
        ),
        When('the spec is run through the real runner and its dumps counted')(
          'outcome',
          (s) => runFixtureCountingDumps(s.fixture),
        ),
        Then('the failing case names its smallest failing input, wrote one dump and failed on the falsified draw')((
          s,
          expect,
        ) =>
          expect({
            messages: s.outcome.errorMessages.join('\n'),
            annotations: s.outcome.annotations.join('\n'),
            dumps: s.outcome.dumps,
            failed: s.outcome.failedTests,
          }).toSatisfy(
            (report) =>
              report.messages.includes('Property falsified') &&
              report.messages.includes('Shrunk input: [') &&
              report.dumps === 1 &&
              report.annotations.includes('artifacts/traces/') &&
              report.failed === 1,
            'the falsified draw failed once, shrank to its smallest input and left one annotated dump',
          )
        ),
      ),
    )

    scenario(
      'A case whose trace store is unreachable or still receiving blames the store, not the behaviour',
      Gherkin.Do.pipe(
        Given('a spec whose trace store refuses every read, and one whose trace never finishes')(
          'fixture',
          () => Effect.succeed('observation-failure.fixture.ts'),
        ),
        When('both specs are run through the real runner')('outcome', (s) => runVitestOn(s.fixture)),
        Then('both cases fail, naming the store and the unfinished trace, never the behaviour')((s, expect) =>
          expect({
            failed: s.outcome.failedTests,
            names: s.outcome.errorNames,
            sources: s.outcome.errorSources,
          }).toEqual({
            failed: 2,
            names: ['TransportObservationError', 'IncompleteObservationError'],
            sources: ['http://tempo.invalid/api/v2/traces', ''],
          })
        ),
      ),
    )
  })
