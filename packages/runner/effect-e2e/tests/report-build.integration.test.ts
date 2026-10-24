import { type Attempt, MergeReports, mergeReports, renderJson, type Report1 } from '@systemfsoftware/effect-e2e/report'
import { admitTest } from '@systemfsoftware/effect-e2e/run'
import { Gherkin, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import * as Arr from 'effect/Array'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import type * as Schema from 'effect/Schema'

import {
  asserting,
  decodedFromJson,
  greets,
  GREETS_ANSWERS,
  helloContains,
  NOT_GOODBYE,
  reportOf,
} from './__fixtures__/report-runs.fixture.js'
import { targetOf, TEST, worldOf } from './__fixtures__/run-sessions.fixture.js'

const Feature = makeFeature({ it })

const modelStepRowsOf = (report: Report1): ReadonlyArray<ReadonlyArray<string>> =>
  Arr.flatMap(report.results, (result) =>
    Arr.flatMap(result.attempts, (attempt) =>
      Match.valueTags(attempt, {
        Ran: ({ steps }) =>
          Arr.flatMap(steps, (step) =>
            Match.valueTags(step, {
              ActStep: ({ cache }) => [[result.title, 'act', cache.lookup._tag, cache.write]],
              AssertStep: ({ cache }) => [[result.title, 'assert', cache.lookup._tag, cache.write]],
              WaitForStep: ({ cache }) => [[result.title, 'waitFor', cache.lookup._tag, cache.write]],
              ExtractStep: ({ cache }) => [[result.title, 'extract', cache.lookup._tag, cache.write]],
              LocatorStep: () => [],
              ValueStep: () => [],
            })),
        Skipped: () => [],
      })))

const headlineOf = (report: Report1) => ({
  run: [report.run.status, report.run.exitCode],
  summary: report.summary,
  results: report.results.map((result) => [result.title, result.status, result.attempts.length]),
})

const passingAndFailing = Effect.gen(function*() {
  const world = yield* worldOf({
    mode: 'read-write',
    answers: [...GREETS_ANSWERS, helloContains('Goodbye'), NOT_GOODBYE],
  })
  yield* greets(world)
  yield* asserting({ world, retry: 0, statement: 'the greeting says goodbye' })
  const report = reportOf({ world, entries: yield* world.log.entries })
  const decoded = yield* decodedFromJson(report)
  return {
    ...headlineOf(decoded),
    modelSteps: modelStepRowsOf(decoded),
    artifacts: decoded.results.map((result) => [result.title, result.artifacts.map((ref) => ref.kind).toSorted()]),
  }
})

const allPassing = Effect.gen(function*() {
  const world = yield* worldOf({ mode: 'read-write', answers: GREETS_ANSWERS })
  yield* greets(world)
  return headlineOf(yield* decodedFromJson(reportOf({ world, entries: yield* world.log.entries })))
})

const passesOnRetry = Effect.gen(function*() {
  const world = yield* worldOf({
    mode: 'read-write',
    answers: [helloContains('Goodbye'), NOT_GOODBYE, helloContains('Hello')],
  })
  yield* asserting({ world, retry: 0, statement: 'the greeting says goodbye' })
  yield* asserting({ world, retry: 1, statement: 'the greeting says hello' })
  return headlineOf(yield* decodedFromJson(reportOf({ world, entries: yield* world.log.entries })))
})

const skipReasonsOf = (attempts: ReadonlyArray<Attempt>): ReadonlyArray<string> =>
  Arr.flatMap(attempts, (attempt) => Match.valueTags(attempt, { Ran: () => [], Skipped: ({ reason }) => [reason] }))

const platformSkipped = Effect.gen(function*() {
  const world = yield* worldOf({ mode: 'read-write', answers: [] })
  yield* admitTest({ log: world.log, test: TEST, target: targetOf(world), agent: 'default', platforms: ['ios'] })
  const entries = yield* world.log.entries
  const report = yield* decodedFromJson(reportOf({ world, entries }))
  const logged = skipReasonsOf(entries.map((entry) => entry.attempt))
  return {
    ...headlineOf(report),
    reasonsLogged: logged.length,
    reasonsCarried: skipReasonsOf(Arr.flatMap(report.results, (result) => result.attempts)).join() === logged.join(),
  }
})

const keyOrder = Effect.gen(function*() {
  const world = yield* worldOf({
    mode: 'read-write',
    answers: [helloContains('Goodbye'), NOT_GOODBYE, ...GREETS_ANSWERS],
  })
  yield* asserting({ world, retry: 0, statement: 'the greeting says goodbye' })
  yield* greets(world)
  const entries = yield* world.log.entries
  return [entries, Arr.reverse(entries)].map((order) =>
    reportOf({ world, entries: order }).results.map((result) => result.title)
  )
})

const mergedOf = (partials: Arr.NonEmptyReadonlyArray<Report1>): Effect.Effect<string, Schema.SchemaError> =>
  Result.match(mergeReports(new MergeReports({ partials })), {
    onFailure: (missing: never) => missing,
    onSuccess: (decision) =>
      Match.valueTags(decision, {
        ReportsMerged: ({ report }) => renderJson(report),
        RunsDisagree: ({ field }) => Effect.succeed(`runs disagree on ${field}`),
        ResultsOverlap: ({ test }) => Effect.succeed(`results overlap on ${test}`),
      }),
  })

const twoWorkers = Effect.gen(function*() {
  const first = yield* worldOf({ mode: 'read-write', answers: GREETS_ANSWERS })
  const second = yield* worldOf({ mode: 'read-write', answers: [helloContains('Goodbye'), NOT_GOODBYE] })
  yield* greets(first)
  yield* asserting({ world: second, retry: 0, statement: 'the greeting says goodbye' })
  const firstEntries = yield* first.log.entries
  const secondEntries = yield* second.log.entries
  const a = reportOf({ world: first, entries: firstEntries })
  const b = reportOf({ world: second, entries: secondEntries })
  const whole = reportOf({ world: first, entries: [...firstEntries, ...secondEntries] })
  return {
    abEqualsWhole: (yield* mergedOf([a, b])) === (yield* renderJson(whole)),
    baEqualsWhole: (yield* mergedOf([b, a])) === (yield* renderJson(whole)),
    merged: headlineOf(yield* decodedFromJson(whole)),
  }
})

Feature('Building the run report from attempt records')
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'A passing and a failing test produce a report that decodes, with every model-driven step stating its cache decision',
      Gherkin.Do.pipe(
        When('one test greets and checks the greeting, and another asserts the greeting says goodbye')(
          'state',
          () => passingAndFailing,
        ),
        Then(
          'the JSON report decodes, the run fails with exit 1, the summary counts one pass and one failure, and only the failure lists evidence',
        )((s, expect) =>
          expect(s.state).toEqual({
            run: ['failed', 1],
            summary: {
              tests: 2,
              passed: 1,
              failed: 1,
              blocked: 0,
              error: 0,
              interrupted: 0,
              skipped: 0,
              cache: { replayed: 0, handedOff: 0, missed: 3 },
            },
            results: [['greets', 'passed', 1], ['saves', 'failed', 1]],
            modelSteps: [
              ['greets', 'act', 'Missed', 'saved'],
              ['greets', 'assert', 'Missed', 'saved'],
              ['saves', 'assert', 'Missed', 'no-change'],
            ],
            artifacts: [['greets', []], ['saves', ['screen-text', 'screenshot', 'trace-page']]],
          })
        ),
      ),
    )

    scenario(
      'An all-passing run reports passed with exit 0',
      Gherkin.Do.pipe(
        When('the only test greets and checks the greeting')('state', () => allPassing),
        Then('the decoded run passes with exit 0')((s, expect) =>
          expect([s.state.run, s.state.results]).toEqual([['passed', 0], [['greets', 'passed', 1]]])
        ),
      ),
    )

    scenario(
      'A test that passes on retry is one passing result with both attempts',
      Gherkin.Do.pipe(
        When('the test fails its first try and passes its retry')('state', () => passesOnRetry),
        Then('the report holds one passed result with two attempts and the run passes')((s, expect) =>
          expect([s.state.run, s.state.results, s.state.summary.tests]).toEqual([
            ['passed', 0],
            [['saves', 'passed', 2]],
            1,
          ])
        ),
      ),
    )

    scenario(
      'A test skipped by the platform gate is a skipped result with its reason',
      Gherkin.Do.pipe(
        When('a test declared only for ios meets the web target')('state', () => platformSkipped),
        Then('the report lists it skipped with the reason and counts it under skipped')((s, expect) =>
          expect({
            run: s.state.run,
            results: s.state.results,
            skipped: s.state.summary.skipped,
            reasonsLogged: s.state.reasonsLogged,
            reasonsCarried: s.state.reasonsCarried,
          }).toEqual({
            run: ['passed', 0],
            results: [['greets', 'skipped', 1]],
            skipped: 1,
            reasonsLogged: 1,
            reasonsCarried: true,
          })
        ),
      ),
    )

    scenario(
      'Results come out in key order whatever order the attempts were recorded in',
      Gherkin.Do.pipe(
        When('the same entries are built in recorded and in reversed order')('state', () => keyOrder),
        Then('both reports list greets before saves')((s, expect) =>
          expect(s.state).toEqual([['greets', 'saves'], ['greets', 'saves']])
        ),
      ),
    )

    scenario(
      'Two workers partial reports merge in either order into the report built from both',
      Gherkin.Do.pipe(
        When('one worker runs a passing test and another a failing one, and their partials are merged both ways')(
          'state',
          () => twoWorkers,
        ),
        Then('each merge equals the report built from every entry, which decodes and fails the run')((s, expect) =>
          expect({ ab: s.state.abEqualsWhole, ba: s.state.baEqualsWhole, run: s.state.merged.run }).toEqual({
            ab: true,
            ba: true,
            run: ['failed', 1],
          })
        ),
      ),
    )
  })
