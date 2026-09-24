import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import type { StepError } from '@systemfsoftware/effect-gherkin-spec'
import { KernelCase } from '@systemfsoftware/effect-spec-runtime'
import { afterAll, expect, vi } from '@systemfsoftware/vitest'
import { Effect, Fiber } from 'effect'
import type { SavedBasket } from './__fixtures__/clerk-shelf.fixture.js'
import { Shelf, shelfLayer } from './__fixtures__/clerk-shelf.fixture.js'

const Feature = makeFeature({ it })

interface TwoBaskets {
  readonly first: SavedBasket
  readonly second: SavedBasket
}

const twoBaskets = (): TwoBaskets => ({
  first: { owner: 'the first clerk' },
  second: { owner: 'the second clerk' },
})

const shelveBothAtOnce = (baskets: TwoBaskets): Effect.Effect<void, never, Shelf> =>
  Effect.gen(function*() {
    const shelf = yield* Shelf
    const first = yield* Effect.forkChild(shelf.place(baskets.first))
    const second = yield* Effect.forkChild(shelf.place(baskets.second))
    yield* Fiber.join(first)
    yield* Fiber.join(second)
  })

const lastBasketIs = (owner: string): Effect.Effect<void, never, Shelf> =>
  Effect.gen(function*() {
    const shelf = yield* Shelf
    const top = yield* shelf.reopen
    expect(top.owner).toBe(owner)
  })

const shelvingScenario = (owner: string): Effect.Effect<object, StepError, Shelf> =>
  Gherkin.Do.pipe(
    Given('two clerks with full baskets')('baskets', () => Effect.succeed(twoBaskets())),
    When('both clerks shelve at once')('shelved', (s) => shelveBothAtOnce(s.baskets)),
    Then(`the top basket belongs to ${owner}, who happened to shelve last`)(() => lastBasketIs(owner)),
  )

const caseProgramOf = (owner: string): Effect.Effect<object, StepError> =>
  KernelCase.caseProgram(shelvingScenario(owner), shelfLayer)
const messageOfRejection = <U = unknown>(rejection: U): string => rejection instanceof Error ? rejection.message : ''

const reportOfProgram = (program: Effect.Effect<object, StepError>): Effect.Effect<string> =>
  Effect.promise(() =>
    KernelCase.explore(program).then(
      () => '',
      messageOfRejection,
    )
  )

const replayOfReport = (report: string): string => {
  const replay = /CONFORMANCE_REPLAY="([^"]+)"/u.exec(report)?.[1]
  if (replay === undefined) return ''
  return replay
}

const firstLineOf = (report: string): string => {
  const first = report.split('\n')[0]
  return first ?? ''
}

const observeTheRunner = 'the spec reads the report of its own run, so it stays out of the run’s way'

Feature('Two clerks shelve without an agreed order')
  .withScenarioLayer(shelfLayer)
  .body(({ scenario }) => {
    scenario(
      'A spec where two clerks shelve with no agreed order fails and names the order the run took',
      { live: observeTheRunner },
      Gherkin.Do.pipe(
        Given('a spec where two clerks shelve with no agreed order')(
          'program',
          () => Effect.succeed(caseProgramOf('the second clerk')),
        ),
        When('the spec is run')('report', (s) => reportOfProgram(s.program)),
        Then('the failure names the order the run took')((s) => {
          expect(s.report).toMatch(/schedule: seed \d+/u)
          expect(s.report).toMatch(/CONFORMANCE_REPLAY="seed=\d+;path=\d+(,\d+)*"/u)
        }),
      ),
    )

    scenario(
      'Running the spec again with the reported order repeats the failure',
      { live: observeTheRunner },
      Gherkin.Do.pipe(
        Given('the failure report of a spec where two clerks shelve with no agreed order')(
          'report',
          () =>
            Effect.map(reportOfProgram(caseProgramOf('the second clerk')), (failure) => ({
              failure,
              replay: replayOfReport(failure),
            })),
        ),
        When('the spec is run again with the order its report names')('repeated', (s) =>
          Effect.gen(function*() {
            yield* Effect.sync(() => {
              vi.stubEnv('CONFORMANCE_REPLAY', s.report.replay)
            })
            return yield* reportOfProgram(caseProgramOf('the second clerk'))
          })),
        Then('the repeated run fails on the same assertion')((s) => {
          expect(s.report.replay).toMatch(/^seed=\d+;path=\d+(,\d+)*$/u)
          expect(firstLineOf(s.repeated)).toBe(firstLineOf(s.report.failure))
        }),
      ),
    )

    scenario(
      'Two specs where two clerks shelve with no agreed order each report their own failure',
      { live: observeTheRunner },
      Gherkin.Do.pipe(
        Given('two specs whose top baskets disagree')('programs', () =>
          Effect.succeed({
            namesTheSecond: caseProgramOf('the second clerk'),
            namesTheFirst: caseProgramOf('the first clerk'),
          })),
        When('both specs are run')('reports', (s) =>
          Effect.gen(function*() {
            const second = yield* reportOfProgram(s.programs.namesTheSecond)
            const first = yield* reportOfProgram(s.programs.namesTheFirst)
            return { second, first }
          })),
        Then('each spec reports its own failing order')((s) => {
          expect(s.reports.second).toMatch(/CONFORMANCE_REPLAY="/u)
          expect(s.reports.first).toMatch(/CONFORMANCE_REPLAY="/u)
          expect(s.reports.second).not.toBe(s.reports.first)
        }),
      ),
    )
  })

afterAll(() => {
  vi.unstubAllEnvs()
})
