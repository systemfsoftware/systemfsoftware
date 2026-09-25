import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import type { StepError } from '@systemfsoftware/effect-gherkin-spec'
import { KernelCase } from '@systemfsoftware/effect-spec-runtime'
import { afterAll, vi } from '@systemfsoftware/vitest'
import { captureRunBinding } from '@systemfsoftware/vitest/integration'
import { Effect, Fiber } from 'effect'
import type * as Scope from 'effect/Scope'
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

const readBackTopBasket = (owner: string): Effect.Effect<string, string, Shelf> =>
  Shelf.pipe(
    Effect.flatMap((shelf) => shelf.reopen),
    Effect.flatMap((top) =>
      top.owner === owner ? Effect.succeed(top.owner) : Effect.fail(`the top basket belongs to ${top.owner}`)
    ),
  )

/**
 * The spec under exploration: it fails whenever the drawn order does not leave the named clerk's
 * basket on top. Its last step carries the order-dependence, because a program a test hands to the
 * kernel has no runner-provided check callback for a Then to read.
 */
const shelvingSpec = (owner: string) =>
  Gherkin.Do.pipe(
    Given('two clerks with full baskets')('baskets', () => Effect.succeed(twoBaskets())),
    When('both clerks shelve at once')('shelved', (s) => shelveBothAtOnce(s.baskets)),
    When(`the top basket is read back and must belong to ${owner}`)('top', () => readBackTopBasket(owner)),
  )

const messageOfRejection = <U = unknown>(rejection: U): string => rejection instanceof Error ? rejection.message : ''

const reportOfSpec = (owner: string) =>
  Effect.gen(function*() {
    const binding = yield* captureRunBinding
    const body: Effect.Effect<object, StepError, Shelf | Scope.Scope> = binding.bind(shelvingSpec(owner))
    return yield* Effect.promise(() =>
      KernelCase.explore(KernelCase.caseProgram(body, shelfLayer)).then(() => '', messageOfRejection)
    )
  })

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
        Given('a spec where two clerks shelve with no agreed order')('report', () => reportOfSpec('the second clerk')),
        Then('the failure names the schedule and a replay path')((s, expect) =>
          expect({
            schedule: /schedule: seed \d+/u.exec(s.report)?.[0],
            replay: /CONFORMANCE_REPLAY="[^"]+"/u.exec(s.report)?.[0],
          }).toMatchObject({
            schedule: expect.stringMatching(/^schedule: seed \d+$/u),
            replay: expect.stringMatching(/^CONFORMANCE_REPLAY="seed=\d+;path=\d+(,\d+)*"$/u),
          })
        ),
      ),
    )

    scenario(
      'Running the spec again with the reported order repeats the failure',
      { live: observeTheRunner },
      Gherkin.Do.pipe(
        Given('the failure report of a spec where two clerks shelve with no agreed order')(
          'report',
          () =>
            Effect.map(reportOfSpec('the second clerk'), (failure) => ({
              failure,
              replay: replayOfReport(failure),
            })),
        ),
        When('the spec is run again with the order its report names')('repeated', (s) =>
          Effect.gen(function*() {
            yield* Effect.sync(() => {
              vi.stubEnv('CONFORMANCE_REPLAY', s.report.replay)
            })
            return yield* reportOfSpec('the second clerk')
          })),
        Then('the repeated run fails on the same assertion')((s, expect) =>
          expect({
            replay: s.report.replay,
            repeatedFirstLine: firstLineOf(s.repeated),
            failureFirstLine: firstLineOf(s.report.failure),
          }).toMatchObject({
            replay: expect.stringMatching(/^seed=\d+;path=\d+(,\d+)*$/u),
            repeatedFirstLine: firstLineOf(s.report.failure),
          })
        ),
      ),
    )

    scenario(
      'Two specs where two clerks shelve with no agreed order each report their own failure',
      { live: observeTheRunner },
      Gherkin.Do.pipe(
        Given('two specs whose top baskets disagree')('specs', () =>
          Effect.succeed({
            namesTheSecond: reportOfSpec('the second clerk'),
            namesTheFirst: reportOfSpec('the first clerk'),
          })),
        When('both specs are run')('reports', (s) =>
          Effect.gen(function*() {
            const second = yield* s.specs.namesTheSecond
            const first = yield* s.specs.namesTheFirst
            return { second, first }
          })),
        Then('each spec reports its own failing order')((s, expect) =>
          expect({ second: s.reports.second, first: s.reports.first }).toSatisfy(
            ({ first, second }) =>
              second !== first &&
              /CONFORMANCE_REPLAY="/u.test(second) &&
              /CONFORMANCE_REPLAY="/u.test(first),
            'each spec names its own failing order with a replay path',
          )
        ),
      ),
    )
  })

afterAll(() => {
  vi.unstubAllEnvs()
})
