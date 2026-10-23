import * as NodeServices from '@effect/platform-node/NodeServices'
import { decodeReport, emitReports, renderJson, type Report1, TestId } from '@systemfsoftware/effect-e2e/report'
import { admitTest, type AttemptTest } from '@systemfsoftware/effect-e2e/run'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Layer from 'effect/Layer'
import * as Path from 'effect/Path'
import * as Schema from 'effect/Schema'

import {
  asserting,
  blockedTry,
  greets,
  GREETS_ANSWERS,
  helloContains,
  NOT_GOODBYE,
  reportOf,
} from './__fixtures__/report-runs.fixture.js'
import { targetOf, worldOf } from './__fixtures__/run-sessions.fixture.js'

const Feature = makeFeature({ it })

const OUTPUT = '.e2e'

const SWIPES: AttemptTest = {
  id: TestId.make('tests/mobile.e2e.ts > swipes'),
  title: 'swipes',
  file: 'tests/mobile.e2e.ts',
}
const BLOCKS: AttemptTest = {
  id: TestId.make('tests/missing.e2e.ts > blocks'),
  title: 'blocks',
  file: 'tests/missing.e2e.ts',
}
const AWKWARD: AttemptTest = {
  id: TestId.make('tests/awkward.e2e.ts > awkward'),
  title: `Shows <b> & "quotes" 'n' | pipes`,
  file: 'tests/awkward.e2e.ts',
}

interface Counts {
  readonly passed: number
  readonly failed: number
  readonly blocked: number
  readonly skipped: number
}

const numbersOf = (pattern: RegExp, text: string): ReadonlyArray<number> =>
  (pattern.exec(text) ?? []).slice(1).map(Number)

const listCountsOf = (text: string): Counts => {
  const [, passed = -1, failed = -1, blocked = -1, , , skipped = -1] = numbersOf(
    /(\d+) tests: (\d+) passed, (\d+) failed, (\d+) blocked, (\d+) error, (\d+) interrupted, (\d+) skipped/u,
    text,
  )
  return { passed, failed, blocked, skipped }
}

// JUnit has no passed count and folds blocked, error and interrupted into errors.
const junitCountsOf = (text: string): Counts => {
  const [tests = -1, failures = -1, errors = -1, skipped = -1] = numbersOf(
    /<testsuites name="effect-e2e" tests="(\d+)" failures="(\d+)" errors="(\d+)" skipped="(\d+)">/u,
    text,
  )
  return { passed: tests - failures - errors - skipped, failed: failures, blocked: errors, skipped }
}

const ONE_EACH: Counts = { passed: 1, failed: 1, blocked: 0, skipped: 1 }

const SUMMARY_HEADER = '| Tests | Passed | Failed | Blocked | Error | Interrupted | Skipped |'

const markdownCountsOf = (text: string): Counts => {
  const lines = text.split('\n')
  const [, passed = -1, failed = -1, blocked = -1, , , skipped = -1] = (lines[lines.indexOf(SUMMARY_HEADER) + 2] ?? '')
    .split('|')
    .map((cell) => cell.trim())
    .filter((cell) => cell.length > 0)
    .map(Number)
  return { passed, failed, blocked, skipped }
}

const jsonCountsOf = (text: string): Effect.Effect<Counts, Schema.SchemaError> =>
  Schema.decodeEffect(Schema.fromJsonString(Schema.Json))(text).pipe(
    Effect.flatMap(decodeReport),
    Effect.map(({ summary }) => ({
      passed: summary.passed,
      failed: summary.failed,
      blocked: summary.blocked,
      skipped: summary.skipped,
    })),
  )

const suiteDirectory = Effect.flatMap(
  FileSystem.FileSystem,
  (fs) => fs.makeTempDirectoryScoped({ prefix: 'effect-e2e-report-' }),
)

const readOutput = (root: string, file: string) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    return yield* fs.readFileString(path.join(root, OUTPUT, file))
  })

const mixedRun = Effect.gen(function*() {
  const world = yield* worldOf({
    mode: 'read-write',
    answers: [...GREETS_ANSWERS, helloContains('Goodbye'), NOT_GOODBYE],
  })
  yield* greets(world)
  yield* asserting({ world, retry: 0, statement: 'the greeting says goodbye' })
  yield* admitTest({ log: world.log, test: SWIPES, target: targetOf(world), agent: 'default', platforms: ['ios'] })
  return reportOf({ world, entries: yield* world.log.entries })
})

const blockedRun = (test: AttemptTest) =>
  Effect.gen(function*() {
    const world = yield* worldOf({ mode: 'read-write', answers: [] })
    yield* blockedTry({ world, test })
    return reportOf({ world, entries: yield* world.log.entries })
  })

const emittedAll = (report: Report1, root: string) =>
  Effect.gen(function*() {
    const printed = yield* emitReports({
      report,
      reporters: ['list', 'json', 'junit', 'markdown'],
      root,
      output: OUTPUT,
    })
    return {
      list: printed[0] ?? '',
      json: yield* jsonCountsOf(printed[1] ?? ''),
      junit: yield* readOutput(root, 'junit.xml'),
      markdown: yield* readOutput(root, 'summary.md'),
    }
  })

Feature('Rendering the run report for people and CI')
  .withLayer(Layer.empty)
  .live('the reporters write real files under a temporary suite directory')
  .body(({ scenario }) => {
    scenario(
      'The four reporters agree on the counts of a run with a pass, a failure and a skip',
      { scenarioLayer: NodeServices.layer },
      Gherkin.Do.pipe(
        Given('a run where one test passes, one fails and one is skipped by the platform gate')(
          'report',
          () => mixedRun,
        ),
        Given('a temporary suite directory')('root', () => suiteDirectory),
        When('every reporter renders the report')('outputs', ({ report, root }) => emittedAll(report, root)),
        Then('the terminal list, the JSON, junit.xml and summary.md each count one pass, one failure and one skip')((
          s,
          expect,
        ) =>
          expect({
            list: listCountsOf(s.outputs.list),
            json: s.outputs.json,
            junit: junitCountsOf(s.outputs.junit),
            markdown: markdownCountsOf(s.outputs.markdown),
          }).toEqual({ list: ONE_EACH, json: ONE_EACH, junit: ONE_EACH, markdown: ONE_EACH })
        ),
      ),
    )

    scenario(
      'A blocked test is a JUnit error, not a failure, and reads as blocked everywhere else',
      { scenarioLayer: NodeServices.layer },
      Gherkin.Do.pipe(
        Given('a run whose only test opens a page the app does not serve')('report', () => blockedRun(BLOCKS)),
        Given('a temporary suite directory')('root', () => suiteDirectory),
        When('every reporter renders the report')('outputs', ({ report, root }) => emittedAll(report, root)),
        Then('JUnit counts one error and no failure, and the list and Markdown name the test blocked')((s, expect) =>
          expect({
            junit: junitCountsOf(s.outputs.junit),
            junitError: s.outputs.junit.includes('<error message="APP_UNREACHABLE" type="blocked"/>'),
            list: s.outputs.list.split('\n')[0],
            markdownRow: s.outputs.markdown.includes('| blocked | blocks | tests/missing.e2e.ts | web | default |'),
          }).toEqual({
            junit: { passed: 0, failed: 0, blocked: 1, skipped: 0 },
            junitError: true,
            list: 'BLOCKED     blocks [web/default]',
            markdownRow: true,
          })
        ),
      ),
    )

    scenario(
      'A title with markup characters is escaped in JUnit XML and stays one Markdown cell',
      { scenarioLayer: NodeServices.layer },
      Gherkin.Do.pipe(
        Given('a run whose test title holds <, &, quotes and a pipe')('report', () => blockedRun(AWKWARD)),
        Given('a temporary suite directory')('root', () => suiteDirectory),
        When('every reporter renders the report')('outputs', ({ report, root }) => emittedAll(report, root)),
        Then('junit.xml carries the entity-escaped title with unchanged totals, and the Markdown row has five cells')((
          s,
          expect,
        ) =>
          expect({
            escaped: s.outputs.junit.includes(
              'name="Shows &lt;b&gt; &amp; &quot;quotes&quot; &apos;n&apos; | pipes [web/default]"',
            ),
            junit: junitCountsOf(s.outputs.junit),
            markdownCells: (s.outputs.markdown.split('\n').find((line) => line.includes('Shows <b>')) ?? '')
              .split(/(?<!\\)\|/u)
              .slice(1, -1).length,
          }).toEqual({ escaped: true, junit: { passed: 0, failed: 0, blocked: 1, skipped: 0 }, markdownCells: 5 })
        ),
      ),
    )

    scenario(
      'The list reporter alone prints and writes no file',
      { scenarioLayer: NodeServices.layer },
      Gherkin.Do.pipe(
        Given('a run where one test passes, one fails and one is skipped by the platform gate')(
          'report',
          () => mixedRun,
        ),
        Given('a temporary suite directory')('root', () => suiteDirectory),
        When('only the list reporter renders it')('outcome', ({ report, root }) =>
          Effect.gen(function*() {
            const printed = yield* emitReports({ report, reporters: ['list'], root, output: OUTPUT })
            const fs = yield* FileSystem.FileSystem
            const path = yield* Path.Path
            return { printed: printed.length, outputExists: yield* fs.exists(path.join(root, OUTPUT)) }
          })),
        Then('one text is printed and the output directory does not exist')((s, expect) =>
          expect(s.outcome).toEqual({ printed: 1, outputExists: false })
        ),
      ),
    )

    scenario(
      'An output directory that is a regular file fails the file reporters with ARTIFACT_WRITE_FAILED',
      { scenarioLayer: NodeServices.layer },
      Gherkin.Do.pipe(
        Given('a run where one test passes, one fails and one is skipped by the platform gate')(
          'report',
          () => mixedRun,
        ),
        Given('a suite directory whose output path is a regular file')('root', () =>
          Effect.gen(function*() {
            const root = yield* suiteDirectory
            const fs = yield* FileSystem.FileSystem
            const path = yield* Path.Path
            yield* fs.writeFileString(path.join(root, OUTPUT), 'not a directory')
            return root
          })),
        When('the junit reporter renders it')('outcome', ({ report, root }) =>
          Effect.gen(function*() {
            const before = yield* renderJson(report)
            const failed = yield* Effect.flip(emitReports({ report, reporters: ['junit'], root, output: OUTPUT }))
            return { code: failed._tag, reportUnchanged: (yield* renderJson(report)) === before }
          })),
        Then('the emit fails ARTIFACT_WRITE_FAILED and the report is unchanged')((s, expect) =>
          expect(s.outcome).toEqual({ code: 'ARTIFACT_WRITE_FAILED', reportUnchanged: true })
        ),
      ),
    )
  })
